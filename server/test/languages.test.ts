import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayLocal } from '../src/lib/time';
import { Client, makeApp, punch, seed, SITE, workerWithPhone, type Seeded } from './helpers';

let app: FastifyInstance;
let s: Seeded;

beforeEach(async () => {
  app = await makeApp();
  s = await seed(app);
});
afterEach(async () => {
  await app.close();
});

const AR = { 'x-lang': 'ar' };
const HE = { 'x-lang': 'he' };

describe('languages', () => {
  it('answers in the language the app asks for, also for requests with a body', async () => {
    const c = new Client(app);
    const res = await c.post('/api/auth/login', { username: 'ali', password: 'wrong-password' }, AR);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة.');
    const he = await c.post('/api/auth/login', { username: 'ali', password: 'wrong-password' }, HE);
    expect(he.body.error.message).toBe('שם המשתמש או הסיסמה שגויים.');
    const en = await c.post('/api/auth/login', { username: 'ali', password: 'wrong-password' });
    expect(en.body.error.message).toBe('Wrong username or password.');
  });

  it('remembers the account language and uses it when the app does not say', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    expect((await client.get('/api/auth/me')).body.user.locale).toBeNull();
    expect((await client.post('/api/auth/locale', { locale: 'he' })).status).toBe(200);
    expect((await client.get('/api/auth/me')).body.user.locale).toBe('he');
    // A check-out without being checked in: the error follows the account language…
    const res = await punch(client, phone, 'out', SITE);
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('לא נרשמה כניסה.');
    // …unless the app says otherwise.
    const ar = await client.post('/api/punch/challenge', { type: 'out', keyId: phone.keyId }, AR);
    expect(ar.body.error.message).toBe('لم تسجل حضورك بعد.');
    expect((await client.post('/api/auth/locale', { locale: 'fr' })).status).toBe(400);
  });

  it('translates check-in results', async () => {
    const { client, phone } = await workerWithPhone(app, s.workers[0]!);
    const ch = await client.post('/api/punch/challenge', { type: 'in', keyId: phone.keyId }, AR);
    expect(ch.status).toBe(200);
    const far = await punch(client, phone, 'in', { lat: SITE.lat + 0.05, lng: SITE.lng + 0.05 }, {});
    expect(far.body.result).toBe('rejected');
    expect(far.body.message).toMatch(/^You are [\d.]+ km from North Depot\. Go to your workplace and try again\.$/);
    await client.post('/api/auth/locale', { locale: 'ar' });
    const ok = await punch(client, phone, 'in', { lat: SITE.lat + 0.0003, lng: SITE.lng });
    expect(ok.body.result).toBe('accepted');
    expect(ok.body.message).toBe('تم تسجيل الحضور في Main Yard');
  });

  it('shows alerts and change history in the reader’s language', async () => {
    const m = new Client(app);
    await m.login(s.manager.username, s.manager.password);
    const date = addDays(todayLocal('Asia/Amman'), 2);
    await m.post('/api/m/shifts', { workerIds: [s.workers[0]!.id, s.workers[1]!.id], siteId: s.siteId, dates: [date], start: '08:00', end: '16:00' });
    const en = await m.get('/api/m/audit');
    expect(en.body.items[0].summary).toBe('Created 2 shifts at Main Yard (08:00–16:00)');
    const he = await m.get('/api/m/audit', HE);
    expect(he.body.items[0].summary).toBe('נוצרו שתי משמרות באתר Main Yard (08:00–16:00)');
    const ar = await m.get('/api/m/audit', AR);
    expect(ar.body.items[0].summary).toBe('إنشاء ورديتين في Main Yard (08:00–16:00)');

    // A password shared with a coworker: the alert is stored once and read in each language.
    const bea = await workerWithPhone(app, s.workers[1]!);
    const ali = new Client(app, bea.client.userAgent);
    await ali.login(s.workers[0]!.username, s.workers[0]!.password);
    expect((await bea.phone.register(ali)).status).toBe(409);
    const reviews = await m.get('/api/m/reviews', AR);
    expect(reviews.body.alerts[0].message).toBe('تم استخدام حساب Ali Worker على هاتف Bea Worker.');
  });

  it('stores company and account languages and exports CSV in the reader’s language', async () => {
    const company = await s.dev.patch(`/api/dev/companies/${s.companyId}`, { settings: { language: 'ar', weekStartsOn: 0 } });
    expect(company.body.settings).toMatchObject({ language: 'ar', weekStartsOn: 0 });
    // Without a choice the account follows the phone's language (saved by the app on first sign-in).
    const created = await s.dev.post('/api/dev/users', { role: 'worker', companyId: s.companyId, username: 'dina', fullName: 'Dina Worker' });
    expect(created.body.user.locale).toBeNull();
    const chosen = await s.dev.post('/api/dev/users', { role: 'worker', companyId: s.companyId, username: 'eli', fullName: 'Eli Worker', locale: 'he' });
    expect(chosen.body.user.locale).toBe('he');
    expect((await s.dev.patch(`/api/dev/users/${chosen.body.user.id}`, { locale: 'en' })).body.locale).toBe('en');

    const m = new Client(app);
    await m.login(s.manager.username, s.manager.password);
    expect((await m.get('/api/auth/me')).body.user.weekStartsOn).toBe(0);
    const csv = await m.get('/api/m/export/summary.csv', HE);
    expect(csv.status).toBe(200);
    expect(String(csv.body).split('\r\n')[0]).toBe('﻿עובד,מספר עובד,שעות מתוכננות,שעות עבודה בפועל,ימי עבודה,משמרות,איחורים,דקות איחור,היעדרויות,בעיות פתוחות');
  });
});
