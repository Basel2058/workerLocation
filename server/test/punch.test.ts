import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PunchPayload } from '../../shared/types';
import {
  backdatePunches,
  Client,
  FakePhone,
  fakeSelfie,
  IPHONE_ENV,
  makeApp,
  punch,
  samplesAround,
  seed,
  SITE,
  workerWithPhone,
  type Seeded,
} from './helpers';

let app: FastifyInstance;
let s: Seeded;
const inside = { lat: SITE.lat + 0.0004, lng: SITE.lng + 0.0003 };
const farAway = { lat: SITE.lat + 0.02, lng: SITE.lng };

beforeEach(async () => {
  app = await makeApp();
  s = await seed(app);
});
afterEach(async () => {
  await app.close();
});

async function manager() {
  const m = new Client(app, 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36');
  await m.login('maria', 'manager-pass-1');
  return m;
}

describe('phone binding', () => {
  it('approves the first phone automatically and remembers it', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const status = await client.get('/api/device/status', { 'x-device-key': phone.keyId });
    expect(status.body.state).toBe('active');
    const home = await client.get('/api/worker/home', { 'x-device-key': phone.keyId });
    expect(home.body.device.status).toBe('active');
  });

  it('refuses a phone that belongs to another worker (password sharing)', async () => {
    const ali = await workerWithPhone(app, s.workers[0]!);
    // Bea signs in on Ali's phone: same browser, same key, same cookie jar.
    const bea = new Client(app);
    bea.cookies = new Map(ali.client.cookies);
    await bea.login('bea', 'bea-pass-1');
    const res = await ali.phone.register(bea);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEVICE_OF_OTHER_WORKER');
    const event = app.ctx.db.prepare("SELECT * FROM security_events WHERE kind = 'device_conflict'").get() as { message: string };
    expect(event.message).toContain('Bea Worker');
    expect(event.message).toContain('Ali Worker');
  });

  it('catches a fresh key in a browser that remembers another worker', async () => {
    const ali = await workerWithPhone(app, s.workers[0]!);
    const bea = new Client(app);
    bea.cookies = new Map(ali.client.cookies); // site data kept, only the key store was cleared
    await bea.login('bea', 'bea-pass-1');
    const fresh = await FakePhone.create();
    const res = await fresh.register(bea);
    expect(res.body.error.code).toBe('DEVICE_OF_OTHER_WORKER');
  });

  it('needs manager approval for a second phone and retires the old one', async () => {
    const first = await workerWithPhone(app, s.workers[0]!);
    const other = new Client(app);
    await other.login('ali', 'ali-pass-1');
    const phone2 = await FakePhone.create();
    const reg = await phone2.register(other, 'New phone, old one broke');
    expect(reg.body.status).toBe('pending');

    // A pending phone cannot punch.
    const blocked = await other.post('/api/punch/challenge', { type: 'in', keyId: phone2.keyId });
    expect(blocked.body.error.code).toBe('DEVICE_PENDING');

    const m = await manager();
    const queue = await m.get('/api/m/reviews');
    expect(queue.body.devices).toHaveLength(1);
    expect(queue.body.devices[0]).toMatchObject({ userName: 'Ali Worker', requestNote: 'New phone, old one broke' });
    expect(queue.body.devices[0].currentDevice.label).toContain('iPhone');
    await m.post(`/api/m/devices/${reg.body.deviceId}/approve`);

    expect((await other.get('/api/device/status', { 'x-device-key': phone2.keyId })).body.state).toBe('active');
    expect((await first.client.get('/api/device/status', { 'x-device-key': first.phone.keyId })).body.state).toBe('revoked');
    const audit = app.ctx.db.prepare("SELECT summary FROM audit_log WHERE action = 'device.approve'").get() as { summary: string };
    expect(audit.summary).toContain('Ali Worker');
  });

  it('rejects registrations with a forged signature', async () => {
    const c = new Client(app);
    await c.login('ali', 'ali-pass-1');
    const phone = await FakePhone.create();
    const impostor = await FakePhone.create();
    const ch = await c.post('/api/device/challenge');
    const envelope = await impostor.sign({ v: 1, nonce: ch.body.nonce, publicKey: phone.jwk, fingerprint: {}, note: '' });
    const res = await c.post('/api/device/register', { ...envelope, keyId: phone.keyId });
    expect(res.status).toBe(400);
  });
});

describe('check in and out', () => {
  it('checks in at the workplace with a selfie and checks out later', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const res = await punch(client, phone, 'in', inside);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ result: 'accepted', type: 'in', siteName: 'Main Yard' });

    const home = await client.get('/api/worker/home', { 'x-device-key': phone.keyId });
    expect(home.body.openEntry.siteName).toBe('Main Yard');

    const m = await manager();
    const live = await m.get('/api/m/live');
    const row = live.body.rows.find((r: { worker: { id: number } }) => r.worker.id === s.workers[0]!.id);
    expect(row.status).toBe('on_site');
    expect(row.location).toMatchObject({ kind: 'in' });
    expect(row.worker.phone).toBe('+962 79 000 010');
    expect(row.selfieId).toBeTruthy();
    const photo = await m.get(`/api/selfies/${row.selfieId}`);
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    // Another worker cannot see the photo.
    const bea = new Client(app);
    await bea.login('bea', 'bea-pass-1');
    expect((await bea.get(`/api/selfies/${row.selfieId}`)).status).toBe(403);

    // Too soon to check out again.
    expect((await punch(client, phone, 'out', inside)).body.error.code).toBe('TOO_SOON');
    backdatePunches(app, s.workers[0]!.id, 120);
    const out = await punch(client, phone, 'out', inside);
    expect(out.body.result).toBe('accepted');
    const history = await client.get('/api/worker/history');
    expect(history.body[0].entries[0].minutes).toBe(120);
  });

  it('rejects check-ins from far away and lets the worker ask the manager instead', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const res = await punch(client, phone, 'in', farAway);
    expect(res.body).toMatchObject({ result: 'rejected', reason: 'OUTSIDE_GEOFENCE', canRequest: true });
    expect(res.body.distanceM).toBeGreaterThan(2000);
    expect(res.body.message).toContain('Main Yard');

    const req = await punch(client, phone, 'in', farAway, { request: { note: 'At the client office today' } });
    expect(req.body.result).toBe('review');

    const m = await manager();
    const queue = await m.get('/api/m/reviews');
    expect(queue.body.punches).toHaveLength(1);
    expect(queue.body.punches[0]).toMatchObject({ workerName: 'Ali Worker', note: 'At the client office today' });
    expect(queue.body.punches[0].flags).toContain('OFF_SITE_REQUEST');

    await m.post(`/api/m/punches/${queue.body.punches[0].id}/review`, { decision: 'reject', note: 'Not approved' });
    const entry = app.ctx.db.prepare('SELECT status FROM time_entries WHERE worker_id = ?').get(s.workers[0]!.id) as { status: string };
    expect(entry.status).toBe('void');
    const home = await client.get('/api/worker/home', { 'x-device-key': phone.keyId });
    expect(home.body.openEntry).toBeNull();
    expect(home.body.notices[0]).toContain('did not accept');
  });

  it('refuses replayed and tampered requests', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const ch = await client.post('/api/punch/challenge', { type: 'in', keyId: phone.keyId });
    const payload: PunchPayload = {
      v: 1,
      nonce: ch.body.nonce,
      type: 'in',
      samples: samplesAround(inside.lat, inside.lng),
      clientTime: Date.now(),
      tz: 'Asia/Amman',
      env: IPHONE_ENV,
      selfie: fakeSelfie(),
    };
    const envelope = await phone.sign(payload);
    const tampered = { ...envelope, payload: envelope.payload.replace(String(payload.samples[0]!.lat), String(SITE.lat)) };
    const bad = await client.post('/api/punch', tampered);
    expect(bad.body.error.code).toBe('BAD_SIGNATURE');

    expect((await client.post('/api/punch', envelope)).body.result).toBe('accepted');
    backdatePunches(app, s.workers[0]!.id, 10);
    const replay = await client.post('/api/punch', envelope);
    expect(replay.body.error.code).toBe('CHALLENGE_INVALID');
    const kinds = (app.ctx.db.prepare('SELECT kind FROM security_events').all() as Array<{ kind: string }>).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['bad_signature', 'replay']));
  });

  it('does not accept a used challenge twice', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const ch = await client.post('/api/punch/challenge', { type: 'in', keyId: phone.keyId });
    const base = {
      v: 1 as const,
      nonce: ch.body.nonce,
      type: 'in' as const,
      samples: samplesAround(farAway.lat, farAway.lng),
      clientTime: Date.now(),
      tz: 'Asia/Amman',
      env: IPHONE_ENV,
      selfie: fakeSelfie(),
    };
    expect((await client.post('/api/punch', await phone.sign(base))).body.result).toBe('rejected');
    const again = await client.post('/api/punch', await phone.sign({ ...base, samples: samplesAround(inside.lat, inside.lng) }));
    expect(again.body.error.code).toBe('CHALLENGE_INVALID');
  });

  it('requires a selfie when the company asks for one', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const ch = await client.post('/api/punch/challenge', { type: 'in', keyId: phone.keyId });
    expect(ch.body.requireSelfie).toBe(true);
    const envelope = await phone.sign({
      v: 1,
      nonce: ch.body.nonce,
      type: 'in',
      samples: samplesAround(inside.lat, inside.lng),
      clientTime: Date.now(),
      tz: 'Asia/Amman',
      env: IPHONE_ENV,
    });
    expect((await client.post('/api/punch', envelope)).body.error.code).toBe('SELFIE_REQUIRED');
  });

  it('flags a reused photo', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const selfie = fakeSelfie();
    await punch(client, phone, 'in', inside, { selfie });
    backdatePunches(app, s.workers[0]!.id, 60);
    const out = await punch(client, phone, 'out', inside, { selfie });
    expect(out.body.result).toBe('review');
    const flags = JSON.parse((app.ctx.db.prepare("SELECT flags FROM punches WHERE type = 'out'").get() as { flags: string }).flags);
    expect(flags).toContain('SELFIE_DUPLICATE');
  });

  it('links check-ins to shifts and reports lateness', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const m = await manager();
    const start = new Date(Date.now() - 40 * 60_000);
    const tz = 'Asia/Amman';
    const fmt = (d: Date, opt: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, ...opt }).format(d);
    const date = fmt(start, { year: 'numeric', month: '2-digit', day: '2-digit' });
    const time = fmt(start, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const end = fmt(new Date(start.getTime() + 8 * 3600_000), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const created = await m.post('/api/m/shifts', { workerIds: [s.workers[0]!.id], siteId: s.siteId, dates: [date], start: time, end, note: '' });
    expect(created.status).toBe(200);
    const res = await punch(client, phone, 'in', inside);
    expect(res.body.result).toBe('accepted');
    expect(res.body.lateMinutes).toBeGreaterThanOrEqual(39);
    const live = await m.get('/api/m/live');
    const row = live.body.rows.find((r: { worker: { id: number } }) => r.worker.id === s.workers[0]!.id);
    expect(row.shift.id).toBe(created.body[0].id);
    expect(row.lateMinutes).toBeGreaterThanOrEqual(39);
    expect(live.body.counts.lateArrivals).toBe(1);
  });

  it('flags check-ins without a shift and can forbid them', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const res = await punch(client, phone, 'in', inside);
    expect(res.body.result).toBe('accepted');
    const flags = JSON.parse((app.ctx.db.prepare('SELECT flags FROM punches').get() as { flags: string }).flags);
    expect(flags).toContain('UNSCHEDULED');

    await s.dev.patch(`/api/dev/companies/${s.companyId}`, { settings: { allowUnscheduled: false } });
    const bea = await workerWithPhone(app, s.workers[1]!);
    const denied = await punch(bea.client, bea.phone, 'in', inside);
    expect(denied.body).toMatchObject({ result: 'rejected', reason: 'NO_SHIFT' });
  });

  it('marks forgotten check-outs as incomplete for the manager to fix', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    await punch(client, phone, 'in', inside);
    backdatePunches(app, s.workers[0]!.id, 15 * 60);
    const job = await app.ctx.jobs.run('attendance');
    expect(job.lastMessage).toContain('1 missing');
    const m = await manager();
    const queue = await m.get('/api/m/reviews');
    expect(queue.body.incomplete).toHaveLength(1);
    const entryId = queue.body.incomplete[0].id;
    const local = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Amman', dateStyle: 'short', timeStyle: 'short' })
      .format(new Date(Date.now() - 7 * 3600_000))
      .replace(' ', 'T');
    const fixed = await m.patch(`/api/m/entries/${entryId}`, { clockOut: local, reason: 'Worker forgot to check out' });
    expect(fixed.status).toBe(200);
    expect(fixed.body.status).toBe('closed');
    expect(fixed.body.minutes).toBeGreaterThan(400);
    const audit = app.ctx.db.prepare("SELECT details FROM audit_log WHERE action = 'entry.update'").get() as { details: string };
    expect(JSON.parse(audit.details).reason).toBe('Worker forgot to check out');
  });

  it('runs presence checks for checked-in workers', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    await punch(client, phone, 'in', inside);
    const m = await manager();
    const check = await m.post('/api/m/presence', { workerId: s.workers[0]!.id });
    expect(check.body.status).toBe('pending');
    const home = await client.get('/api/worker/home', { 'x-device-key': phone.keyId });
    expect(home.body.presenceCheck.id).toBe(check.body.id);

    const ch = await client.post(`/api/presence/${check.body.id}/challenge`, { keyId: phone.keyId });
    const envelope = await phone.sign({
      v: 1,
      nonce: ch.body.nonce,
      type: 'check',
      checkId: check.body.id,
      samples: samplesAround(farAway.lat, farAway.lng),
      clientTime: Date.now(),
      tz: 'Asia/Amman',
      env: IPHONE_ENV,
      selfie: ch.body.requireSelfie ? fakeSelfie() : undefined,
    });
    const res = await client.post(`/api/presence/${check.body.id}`, envelope);
    expect(res.body.status).toBe('failed');
    const queue = await m.get('/api/m/reviews');
    expect(queue.body.alerts.map((a: { kind: string }) => a.kind)).toContain('presence_failed');
    const live = await m.get('/api/m/live');
    const row = live.body.rows.find((r: { worker: { id: number } }) => r.worker.id === s.workers[0]!.id);
    expect(row.presence.status).toBe('failed');
    expect(row.location.kind).toBe('check');
  });
});
