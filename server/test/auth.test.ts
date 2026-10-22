import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentStep, totpCode } from '../src/auth/totp';
import { Client, makeApp, seed, type Seeded } from './helpers';

let app: FastifyInstance;
let s: Seeded;

beforeEach(async () => {
  app = await makeApp();
  s = await seed(app);
});
afterEach(async () => {
  await app.close();
});

describe('sign in', () => {
  it('signs in and returns the user with company info', async () => {
    const c = new Client(app);
    const res = await c.login('ALI', 'ali-pass-1');
    expect(res.body.user).toMatchObject({ role: 'worker', companyName: 'Acme Builders', timezone: 'Asia/Amman' });
    const me = await c.get('/api/auth/me');
    expect(me.body.user.username).toBe('ali');
  });

  it('rejects wrong passwords without revealing whether the user exists', async () => {
    const c = new Client(app);
    const a = await c.post('/api/auth/login', { username: 'ali', password: 'nope-nope' });
    const b = await c.post('/api/auth/login', { username: 'ghost', password: 'nope-nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body.error.message).toBe(b.body.error.message);
  });

  it('locks the account after repeated wrong passwords', async () => {
    const c = new Client(app);
    for (let i = 0; i < 8; i++) {
      await c.post('/api/auth/login', { username: 'bea', password: `wrong-${i}` }, { 'x-test-ip': `10.0.0.${i}` });
    }
    const res = await c.post('/api/auth/login', { username: 'bea', password: 'bea-pass-1' }, { 'x-test-ip': '10.0.1.1' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    const events = app.ctx.db.prepare("SELECT kind FROM security_events WHERE kind = 'account_locked'").all();
    expect(events).toHaveLength(1);
    // The developer can unlock it.
    await s.dev.post(`/api/dev/users/${s.workers[1]!.id}/unlock`);
    expect((await c.post('/api/auth/login', { username: 'bea', password: 'bea-pass-1' }, { 'x-test-ip': '10.0.1.2' })).status).toBe(200);
  });

  it('blocks state-changing requests without the CSRF header', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'ali', password: 'ali-pass-1' },
    });
    expect(res.statusCode).toBe(403);
    const foreign = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-requested-with': 'onsite', origin: 'https://evil.example', host: 'onsite.example' },
      payload: { username: 'ali', password: 'ali-pass-1' },
    });
    expect(foreign.statusCode).toBe(403);
  });

  it('forces a password change when required', async () => {
    await s.dev.post(`/api/dev/users/${s.workers[0]!.id}/reset-password`, { password: 'temp-pass-99', mustChangePassword: true });
    const c = new Client(app);
    await c.login('ali', 'temp-pass-99');
    expect((await c.get('/api/auth/me')).body.user.mustChangePassword).toBe(true);
    expect((await c.get('/api/worker/home')).body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const weak = await c.post('/api/auth/change-password', { currentPassword: 'temp-pass-99', newPassword: '12345678' });
    expect(weak.body.error.code).toBe('WEAK_PASSWORD');
    const ok = await c.post('/api/auth/change-password', { currentPassword: 'temp-pass-99', newPassword: 'my-own-secret-7' });
    expect(ok.status).toBe(200);
    expect((await c.get('/api/worker/home')).status).toBe(200);
  });

  it('signs out', async () => {
    const c = new Client(app);
    await c.login('ali', 'ali-pass-1');
    await c.post('/api/auth/logout');
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });
});

describe('access control', () => {
  it('keeps workers out of manager and developer areas', async () => {
    const c = new Client(app);
    await c.login('ali', 'ali-pass-1');
    expect((await c.get('/api/m/live')).status).toBe(403);
    expect((await c.get('/api/dev/companies')).status).toBe(403);
  });

  it('keeps managers in their own company', async () => {
    const other = await s.dev.post('/api/dev/companies', { name: 'Other Co', timezone: 'Europe/London' });
    const otherWorker = await s.dev.post('/api/dev/users', {
      role: 'worker',
      companyId: other.body.id,
      username: 'olga',
      fullName: 'Olga Other',
      password: 'olga-pass-1',
    });
    const m = new Client(app);
    await m.login('maria', 'manager-pass-1');
    expect((await m.get('/api/dev/companies')).status).toBe(403);
    // A manager cannot switch company with the developer header.
    const live = await m.get('/api/m/live', { 'x-company-id': String(other.body.id) });
    expect(live.status).toBe(200);
    expect(live.body.rows.every((r: { worker: { id: number } }) => r.worker.id !== otherWorker.body.user.id)).toBe(true);
    expect((await m.get(`/api/m/workers/${otherWorker.body.user.id}`)).status).toBe(404);
    expect((await m.post('/api/m/presence', { workerId: otherWorker.body.user.id })).status).toBe(404);
  });

  it('lets the developer act on any company through the header', async () => {
    expect((await s.dev.get('/api/m/live')).body.error.code).toBe('COMPANY_REQUIRED');
    const live = await s.dev.get('/api/m/live', { 'x-company-id': String(s.companyId) });
    expect(live.status).toBe(200);
    expect(live.body.timezone).toBe('Asia/Amman');
  });

  it('blocks everyone in a deactivated company except the developer', async () => {
    await s.dev.patch(`/api/dev/companies/${s.companyId}`, { active: false });
    const m = new Client(app);
    const res = await m.post('/api/auth/login', { username: 'maria', password: 'manager-pass-1' });
    expect(res.body.error.code).toBe('COMPANY_INACTIVE');
  });
});

describe('two-step sign-in', () => {
  it('sets up and requires an authenticator code', async () => {
    const setup = await s.dev.post('/api/auth/totp/setup');
    expect(setup.body.qrSvg).toContain('<svg');
    const secret = setup.body.secret as string;
    const enable = await s.dev.post('/api/auth/totp/enable', { code: totpCode(secret, currentStep()) });
    expect(enable.status).toBe(200);

    const c = new Client(app);
    const login = await c.post('/api/auth/login', { username: 'owner', password: 'owner-pass-1' });
    expect(login.body.needsTotp).toBe(true);
    expect((await c.get('/api/dev/overview')).body.error.code).toBe('MFA_REQUIRED');
    expect((await c.post('/api/auth/totp', { code: '000000' })).status).toBe(401);
    const ok = await c.post('/api/auth/totp', { code: totpCode(secret, currentStep() + 1) });
    expect(ok.status).toBe(200);
    expect((await c.get('/api/dev/overview')).status).toBe(200);
  });
});
