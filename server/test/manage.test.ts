import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayLocal, weekStart } from '../src/lib/time';
import { backdatePunches, Client, makeApp, punch, seed, SITE, workerWithPhone, type Seeded } from './helpers';

let app: FastifyInstance;
let s: Seeded;
let m: Client;
const TZ = 'Asia/Amman';

beforeEach(async () => {
  app = await makeApp();
  s = await seed(app);
  m = new Client(app);
  await m.login('maria', 'manager-pass-1');
});
afterEach(async () => {
  await app.close();
});

/** Local date + HH:mm in Amman for an offset from now. */
function localAt(offsetMin: number) {
  const d = new Date(Date.now() + offsetMin * 60_000);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
  return { date, time };
}

describe('shifts', () => {
  it('creates shifts for several workers and days, refusing overlaps', async () => {
    const today = todayLocal(TZ);
    const dates = [addDays(today, 1), addDays(today, 2)];
    const res = await m.post('/api/m/shifts', {
      workerIds: [s.workers[0]!.id, s.workers[1]!.id],
      siteId: s.siteId,
      dates,
      start: '08:00',
      end: '16:00',
      note: 'Bring helmets',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
    expect(res.body[0]).toMatchObject({ siteName: 'Main Yard', note: 'Bring helmets' });

    const clash = await m.post('/api/m/shifts', { workerIds: [s.workers[0]!.id], siteId: s.siteId, dates: [dates[0]], start: '15:00', end: '20:00' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.details.clashes[0]).toContain('Ali Worker');

    const list = await m.get(`/api/m/shifts?from=${dates[0]}&to=${dates[1]}`);
    expect(list.body).toHaveLength(4);

    const moved = await m.patch(`/api/m/shifts/${res.body[0].id}`, { start: '09:00', end: '17:30', siteId: s.site2Id });
    expect(moved.body).toMatchObject({ siteName: 'North Depot', date: dates[0] });
    expect((await m.delete(`/api/m/shifts/${res.body[1].id}`)).status).toBe(200);
  });

  it('supports overnight shifts', async () => {
    const date = addDays(todayLocal(TZ), 3);
    const res = await m.post('/api/m/shifts', { workerIds: [s.workers[2]!.id], siteId: s.siteId, dates: [date], start: '22:00', end: '06:00' });
    const shift = res.body[0];
    expect(Date.parse(shift.endsAt) - Date.parse(shift.startsAt)).toBe(8 * 3600_000);
  });

  it('copies a week onto the next week', async () => {
    const thisWeek = weekStart(todayLocal(TZ));
    const nextWeek = addDays(thisWeek, 7);
    await m.post('/api/m/shifts', {
      workerIds: [s.workers[0]!.id],
      siteId: s.siteId,
      dates: [thisWeek, addDays(thisWeek, 2)],
      start: '07:00',
      end: '15:00',
    });
    const copy = await m.post('/api/m/shifts/copy-week', { from: thisWeek, to: nextWeek });
    expect(copy.body).toEqual({ created: 2, skipped: 0 });
    const again = await m.post('/api/m/shifts/copy-week', { from: thisWeek, to: nextWeek });
    expect(again.body).toEqual({ created: 0, skipped: 2 });
    const list = await m.get(`/api/m/shifts?from=${nextWeek}&to=${addDays(nextWeek, 6)}`);
    expect(list.body.map((x: { date: string }) => x.date)).toEqual([nextWeek, addDays(nextWeek, 2)]);
  });
});

describe('live board', () => {
  it('shows who is late, absent, upcoming and on site', async () => {
    const late = localAt(-45);
    const lateEnd = localAt(6 * 60);
    const upcoming = localAt(90);
    const upcomingEnd = localAt(9 * 60);
    await m.post('/api/m/shifts', { workerIds: [s.workers[0]!.id], siteId: s.siteId, dates: [late.date], start: late.time, end: lateEnd.time });
    await m.post('/api/m/shifts', { workerIds: [s.workers[1]!.id], siteId: s.siteId, dates: [upcoming.date], start: upcoming.time, end: upcomingEnd.time });
    // Carl checks in without a shift.
    const carl = await workerWithPhone(app, s.workers[2]!);
    await punch(carl.client, carl.phone, 'in', { lat: SITE.lat + 0.0003, lng: SITE.lng });

    const live = await m.get('/api/m/live');
    const status = (id: number) => live.body.rows.find((r: { worker: { id: number } }) => r.worker.id === id)?.status;
    // These shifts may cross midnight in Amman; only assert when they fall on today.
    if (late.date === live.body.date) expect(status(s.workers[0]!.id)).toBe('late');
    if (upcoming.date === live.body.date) expect(status(s.workers[1]!.id)).toBe('upcoming');
    expect(status(s.workers[2]!.id)).toBe('on_site');
    expect(live.body.counts.onSite).toBe(1);
    expect(live.body.rows[0].status).toBe(late.date === live.body.date ? 'late' : 'on_site');
    expect(live.body.sites.map((x: { name: string }) => x.name)).toEqual(['Main Yard', 'North Depot']);
  });
});

describe('timesheets', () => {
  it('sums hours and exports CSV safely', async () => {
    const ali = await workerWithPhone(app, s.workers[0]!);
    await punch(ali.client, ali.phone, 'in', { lat: SITE.lat + 0.0002, lng: SITE.lng });
    backdatePunches(app, s.workers[0]!.id, 90);
    await punch(ali.client, ali.phone, 'out', { lat: SITE.lat + 0.0002, lng: SITE.lng });

    // A manual entry with a reason, e.g. for a worker without a smartphone.
    const day = todayLocal(TZ);
    const yesterday = addDays(day, -1);
    const manual = await m.post('/api/m/entries', {
      workerId: s.workers[1]!.id,
      siteId: s.siteId,
      clockIn: `${yesterday}T08:00`,
      clockOut: `${yesterday}T12:30`,
      reason: '=cmd| forgot phone',
    });
    expect(manual.status).toBe(200);
    expect(manual.body).toMatchObject({ source: 'manual', minutes: 270, status: 'closed' });

    const overlap = await m.post('/api/m/entries', {
      workerId: s.workers[1]!.id,
      siteId: s.siteId,
      clockIn: `${yesterday}T12:00`,
      clockOut: `${yesterday}T13:00`,
      reason: 'duplicate',
    });
    expect(overlap.body.error.code).toBe('ENTRY_OVERLAP');

    const sheet = await m.get(`/api/m/timesheets?from=${yesterday}&to=${day}`);
    const row = (id: number) => sheet.body.rows.find((r: { worker: { id: number } }) => r.worker.id === id);
    expect(row(s.workers[0]!.id).workedMinutes).toBe(90);
    expect(row(s.workers[1]!.id).workedMinutes).toBe(270);
    expect(sheet.body.totals.workedMinutes).toBe(360);

    const csv = await m.get(`/api/m/export/entries.csv?from=${yesterday}&to=${day}`);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.startsWith('﻿Date,Worker')).toBe(true);
    expect(csv.body).toContain("'=cmd| forgot phone");
    const summary = await m.get(`/api/m/export/summary.csv?from=${yesterday}&to=${day}`);
    expect(summary.body).toContain('Bea Worker,,0.00,4.50');

    // Remove and restore keeps an audit trail.
    await m.post(`/api/m/entries/${manual.body.id}/void`, { reason: 'Entered twice' });
    expect((await m.get(`/api/m/timesheets?from=${yesterday}&to=${day}`)).body.totals.workedMinutes).toBe(90);
    await m.post(`/api/m/entries/${manual.body.id}/restore`, { reason: 'Was correct after all' });
    const audit = await m.get('/api/m/audit');
    expect(audit.body.items.map((a: { action: string }) => a.action)).toEqual(
      expect.arrayContaining(['entry.create', 'entry.void', 'entry.restore']),
    );
  });

  it('rejects entries in the future', async () => {
    const tomorrow = addDays(todayLocal(TZ), 1);
    const res = await m.post('/api/m/entries', {
      workerId: s.workers[0]!.id,
      siteId: s.siteId,
      clockIn: `${tomorrow}T08:00`,
      clockOut: null,
      reason: 'test entry',
    });
    expect(res.status).toBe(400);
  });
});

describe('developer console', () => {
  it('manages companies, sites and people', async () => {
    const companies = await s.dev.get('/api/dev/companies');
    expect(companies.body[0]).toMatchObject({ name: 'Acme Builders', workers: 3, managers: 1, sites: 2 });

    const badSite = await s.dev.post('/api/dev/sites', { companyId: s.companyId, name: 'X', lat: 95, lng: 0, radiusM: 100 });
    expect(badSite.status).toBe(400);
    const wifi = await s.dev.patch(`/api/dev/sites/${s.siteId}`, { networks: ['203.0.113.0/24'], requireNetwork: false });
    expect(wifi.body.networks).toEqual(['203.0.113.0/24']);

    const created = await s.dev.post('/api/dev/users', {
      role: 'worker',
      companyId: s.companyId,
      username: 'Dana.K',
      fullName: 'Dana K',
      phone: '+962790000099',
    });
    expect(created.body.user.username).toBe('dana.k');
    expect(created.body.password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const dup = await s.dev.post('/api/dev/users', { role: 'worker', companyId: s.companyId, username: 'dana.k', fullName: 'Dup' });
    expect(dup.body.error.code).toBe('USERNAME_TAKEN');

    const dana = new Client(app);
    await dana.login('dana.k', created.body.password);
    const reset = await s.dev.post(`/api/dev/users/${created.body.user.id}/reset-password`, {});
    expect((await dana.get('/api/auth/me')).status).toBe(401); // old sessions end on reset
    await dana.login('dana.k', reset.body.password);

    const off = await s.dev.patch(`/api/dev/users/${created.body.user.id}`, { active: false });
    expect(off.body.active).toBe(false);
    expect((await dana.get('/api/auth/me')).status).toBe(401);
  });

  it('shows health, logs, sessions and jobs', async () => {
    const overview = await s.dev.get('/api/dev/overview');
    expect(overview.body.status).toBe('ok');
    expect(overview.body.stats).toMatchObject({ companies: 1, workers: 3, managers: 1 });
    expect(overview.body.punchesByHour).toHaveLength(24);

    await s.dev.post('/api/client-log', { message: 'TypeError: x is undefined', url: '/w' });
    const logs = await s.dev.get('/api/dev/logs?level=error');
    expect(logs.body.items[0].message).toBe('TypeError: x is undefined');
    await s.dev.post('/api/dev/logs/resolve', { id: logs.body.items[0].id });
    expect((await s.dev.get('/api/dev/logs?unresolved=1')).body.items).toHaveLength(0);

    const sessions = await s.dev.get('/api/dev/sessions');
    expect(sessions.body.some((x: { username: string }) => x.username === 'maria')).toBe(true);
    const mariaSession = sessions.body.find((x: { username: string }) => x.username === 'maria');
    await s.dev.post(`/api/dev/sessions/${mariaSession.id}/revoke`);
    expect((await m.get('/api/auth/me')).status).toBe(401);

    const job = await s.dev.post('/api/dev/jobs/cleanup/run');
    expect(job.body.lastStatus).toBe('ok');
  });

  it('deletes a company only with the exact name', async () => {
    expect((await s.dev.delete(`/api/dev/companies/${s.companyId}`, { confirmName: 'acme' })).status).toBe(400);
    expect((await s.dev.delete(`/api/dev/companies/${s.companyId}`, { confirmName: 'Acme Builders' })).status).toBe(200);
    expect((await s.dev.get('/api/dev/companies')).body).toHaveLength(0);
    expect(app.ctx.db.prepare("SELECT count(*) AS n FROM users WHERE role <> 'developer'").get()).toEqual({ n: 0 });
  });

  it('keeps at least one developer', async () => {
    const me = (await s.dev.get('/api/auth/me')).body.user;
    const res = await s.dev.patch(`/api/dev/users/${me.id}`, { active: false });
    expect(res.status).toBe(400);
  });
});
