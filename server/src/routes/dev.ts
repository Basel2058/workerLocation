import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  AuditEntry,
  CompanySummary,
  CreatedCredentials,
  DevOverview,
  JobRun,
  Paged,
  PunchSummary,
  SecurityEvent,
  SessionInfo,
  Site,
  SystemLog,
  UserRecord,
} from '../../../shared/types';
import { hashPassword, passwordProblem } from '../auth/password';
import { revokeUserSessions } from '../auth/sessions';
import type { CompanyRow, SiteRow, UserRow } from '../db/rows';
import { actorOf, idParam, rateLimit, requireRole } from '../http';
import { generatePassword, randomToken } from '../lib/crypto';
import { badRequest, conflict, notFound } from '../lib/errors';
import { isValidNetwork } from '../lib/ip';
import { dayRange, isValidTimezone, nowIso, todayLocal } from '../lib/time';
import { companySettings, getCompany, getSite, toCompany, toSite } from '../services/companies';
import { decideDevice, listUserDevices, revokeDevice } from '../services/devices';
import { PUNCH_SELECT, toPunchSummary } from '../services/entries';
import { audit } from '../services/logs';
import { getDevOverview, toSystemLog, type SystemLogRow } from '../services/monitor';
import { EVENT_SELECT, pendingReviewCount, resolveSecurityEvent, toSecurityEvent } from '../services/reviews';
import { getUser, getUserRecord, listUserRecords } from '../services/users';
import { pageAudit, type AuditRow } from './manager';

const settingsSchema = z
  .object({
    selfieMode: z.enum(['always', 'random', 'off']),
    selfieRandomPercent: z.number().int().min(1).max(100),
    maxAccuracyM: z.number().int().min(10).max(2000),
    lateGraceMin: z.number().int().min(0).max(240),
    earlyCheckInMin: z.number().int().min(0).max(720),
    allowUnscheduled: z.boolean(),
    reviewUnscheduled: z.boolean(),
    autoApproveFirstDevice: z.boolean(),
    missingCheckoutAfterMin: z.number().int().min(0).max(1440),
    maxOpenHours: z.number().int().min(1).max(48),
    photoRetentionDays: z.number().int().min(1).max(3650),
    highRiskAction: z.enum(['review', 'reject']),
  })
  .partial();

const timezoneSchema = z.string().refine(isValidTimezone, 'Unknown time zone');
const nameSchema = z.string().trim().min(1, 'Required').max(120);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,39}$/, 'Use 3–40 letters, numbers, dots, dashes or underscores.');
const phoneSchema = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === '' || /^\+?[\d\s\-().]{6,30}$/.test(v), 'Enter a valid phone number.');

const siteSchema = z.object({
  name: nameSchema,
  address: z.string().trim().max(300).default(''),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(20).max(5000),
  networks: z.array(z.string().trim().refine(isValidNetwork, 'Invalid IP address or range')).max(50).default([]),
  requireNetwork: z.boolean().default(false),
  active: z.boolean().default(true),
});

export default async function devRoutes(app: FastifyInstance) {
  const { db, config, jobs } = app.ctx;
  const dev = (req: Parameters<typeof requireRole>[0]) => {
    requireRole(req, 'developer');
    return actorOf(req);
  };

  app.get('/api/dev/overview', async (req): Promise<DevOverview> => {
    dev(req);
    return getDevOverview(app.ctx);
  });

  // --- Companies ------------------------------------------------------------------------------

  function companySummary(row: CompanyRow): CompanySummary {
    const q = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number | null }).n ?? 0;
    const day = dayRange(todayLocal(row.timezone), row.timezone);
    const last = db.prepare('SELECT max(at) AS at FROM punches WHERE company_id = ?').get(row.id) as { at: string | null };
    return {
      ...toCompany(row),
      workers: q("SELECT count(*) AS n FROM users WHERE company_id = ? AND role = 'worker' AND active = 1", row.id),
      managers: q("SELECT count(*) AS n FROM users WHERE company_id = ? AND role = 'manager' AND active = 1", row.id),
      sites: q('SELECT count(*) AS n FROM sites WHERE company_id = ? AND active = 1', row.id),
      shiftsToday: q('SELECT count(*) AS n FROM shifts WHERE company_id = ? AND starts_at >= ? AND starts_at < ?', row.id, day.start, day.end),
      punchesToday: q('SELECT count(*) AS n FROM punches WHERE company_id = ? AND at >= ? AND at < ?', row.id, day.start, day.end),
      pendingReviews: pendingReviewCount(db, row.id),
      lastActivityAt: last.at,
    };
  }

  app.get('/api/dev/companies', async (req): Promise<CompanySummary[]> => {
    dev(req);
    return (db.prepare('SELECT * FROM companies ORDER BY active DESC, name COLLATE NOCASE').all() as CompanyRow[]).map(companySummary);
  });

  app.get('/api/dev/companies/:id', async (req) => {
    dev(req);
    const company = getCompany(db, idParam((req.params as { id: string }).id));
    const sites = (db.prepare('SELECT * FROM sites WHERE company_id = ? ORDER BY name COLLATE NOCASE').all(company.id) as SiteRow[]).map(toSite);
    return { company: companySummary(company), sites };
  });

  app.post('/api/dev/companies', async (req): Promise<CompanySummary> => {
    const actor = dev(req);
    const body = z
      .object({ name: nameSchema, timezone: timezoneSchema, notes: z.string().max(2000).default(''), settings: settingsSchema.default({}) })
      .parse(req.body);
    const now = nowIso();
    const id = Number(
      db
        .prepare('INSERT INTO companies (name, timezone, settings, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(body.name, body.timezone, JSON.stringify(body.settings), body.notes, now, now).lastInsertRowid,
    );
    audit(db, actor, 'company.create', { companyId: id, entity: 'company', entityId: id, summary: `Created company ${body.name}` });
    return companySummary(getCompany(db, id));
  });

  app.patch('/api/dev/companies/:id', async (req): Promise<CompanySummary> => {
    const actor = dev(req);
    const before = getCompany(db, idParam((req.params as { id: string }).id));
    const body = z
      .object({
        name: nameSchema.optional(),
        timezone: timezoneSchema.optional(),
        notes: z.string().max(2000).optional(),
        active: z.boolean().optional(),
        settings: settingsSchema.optional(),
      })
      .parse(req.body);
    const settings = { ...companySettings(before), ...(body.settings ?? {}) };
    db.prepare('UPDATE companies SET name = ?, timezone = ?, notes = ?, active = ?, settings = ?, updated_at = ? WHERE id = ?').run(
      body.name ?? before.name,
      body.timezone ?? before.timezone,
      body.notes ?? before.notes,
      body.active === undefined ? before.active : body.active ? 1 : 0,
      JSON.stringify(settings),
      nowIso(),
      before.id,
    );
    audit(db, actor, 'company.update', {
      companyId: before.id,
      entity: 'company',
      entityId: before.id,
      summary: `Updated company ${body.name ?? before.name}`,
      details: { before: { ...toCompany(before) }, changes: body },
    });
    return companySummary(getCompany(db, before.id));
  });

  app.delete('/api/dev/companies/:id', async (req) => {
    const actor = dev(req);
    const company = getCompany(db, idParam((req.params as { id: string }).id));
    const { confirmName } = z.object({ confirmName: z.string() }).parse(req.body ?? {});
    if (confirmName.trim() !== company.name) throw badRequest('Type the company name exactly to confirm.');
    db.prepare('DELETE FROM companies WHERE id = ?').run(company.id);
    audit(db, actor, 'company.delete', {
      companyId: company.id,
      entity: 'company',
      entityId: company.id,
      summary: `Deleted company ${company.name} and all its data`,
    });
    return { ok: true };
  });

  // --- Sites ----------------------------------------------------------------------------------

  app.post('/api/dev/sites', async (req): Promise<Site> => {
    const actor = dev(req);
    const body = siteSchema.extend({ companyId: z.number().int().positive() }).parse(req.body);
    getCompany(db, body.companyId);
    const now = nowIso();
    const id = Number(
      db
        .prepare(
          `INSERT INTO sites (company_id, name, address, lat, lng, radius_m, networks, require_network, active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.companyId,
          body.name,
          body.address,
          body.lat,
          body.lng,
          body.radiusM,
          JSON.stringify(body.networks),
          body.requireNetwork ? 1 : 0,
          body.active ? 1 : 0,
          now,
          now,
        ).lastInsertRowid,
    );
    audit(db, actor, 'site.create', {
      companyId: body.companyId,
      entity: 'site',
      entityId: id,
      summary: `Added workplace ${body.name} (${body.radiusM} m radius)`,
      details: { lat: body.lat, lng: body.lng, radiusM: body.radiusM, networks: body.networks },
    });
    return toSite(getSite(db, body.companyId, id));
  });

  app.patch('/api/dev/sites/:id', async (req): Promise<Site> => {
    const actor = dev(req);
    const id = idParam((req.params as { id: string }).id);
    const before = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined;
    if (!before) throw notFound('Site not found.');
    const body = siteSchema.partial().parse(req.body);
    const next = {
      name: body.name ?? before.name,
      address: body.address ?? before.address,
      lat: body.lat ?? before.lat,
      lng: body.lng ?? before.lng,
      radius_m: body.radiusM ?? before.radius_m,
      networks: body.networks ? JSON.stringify(body.networks) : before.networks,
      require_network: body.requireNetwork === undefined ? before.require_network : body.requireNetwork ? 1 : 0,
      active: body.active === undefined ? before.active : body.active ? 1 : 0,
    };
    db.prepare(
      `UPDATE sites SET name = ?, address = ?, lat = ?, lng = ?, radius_m = ?, networks = ?, require_network = ?, active = ?,
         updated_at = ? WHERE id = ?`,
    ).run(next.name, next.address, next.lat, next.lng, next.radius_m, next.networks, next.require_network, next.active, nowIso(), id);
    audit(db, actor, 'site.update', {
      companyId: before.company_id,
      entity: 'site',
      entityId: id,
      summary: `Updated workplace ${next.name}`,
      details: { before: toSite(before), changes: body },
    });
    return toSite(getSite(db, before.company_id, id));
  });

  app.delete('/api/dev/sites/:id', async (req) => {
    const actor = dev(req);
    const id = idParam((req.params as { id: string }).id);
    const site = db.prepare('SELECT * FROM sites WHERE id = ?').get(id) as SiteRow | undefined;
    if (!site) throw notFound('Site not found.');
    const used = db
      .prepare('SELECT (SELECT count(*) FROM punches WHERE site_id = ?) + (SELECT count(*) FROM time_entries WHERE site_id = ?) AS n')
      .get(id, id) as { n: number };
    if (used.n > 0) throw conflict('This workplace has attendance history. Turn it off instead of deleting it.', 'SITE_IN_USE');
    db.prepare('DELETE FROM sites WHERE id = ?').run(id);
    audit(db, actor, 'site.delete', { companyId: site.company_id, entity: 'site', entityId: id, summary: `Deleted workplace ${site.name}` });
    return { ok: true };
  });

  app.get('/api/dev/geocode', async (req) => {
    dev(req);
    const { q } = z.object({ q: z.string().trim().min(3).max(200) }).parse(req.query);
    rateLimit(req, 'geocode', 1, 1100, 'Searching too fast. Wait a second.');
    const url = `${config.geocoderUrl}/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': `${config.appName}/${config.version} (${config.contactEmail})`, accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      return data.map((d) => ({ name: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
    } catch {
      throw badRequest('Address search is not available right now. Click on the map instead.', 'GEOCODER_UNAVAILABLE');
    }
  });

  // --- People ---------------------------------------------------------------------------------

  app.get('/api/dev/users', async (req): Promise<UserRecord[]> => {
    dev(req);
    const q = z
      .object({
        companyId: z.coerce.number().int().positive().optional(),
        role: z.enum(['developer', 'manager', 'worker']).optional(),
        q: z.string().trim().max(100).optional(),
        includeInactive: z.enum(['0', '1']).optional(),
      })
      .parse(req.query);
    return listUserRecords(db, { ...q, includeInactive: q.includeInactive === '1' });
  });

  app.get('/api/dev/users/:id', async (req) => {
    dev(req);
    const user = getUser(db, idParam((req.params as { id: string }).id));
    return { user: getUserRecord(db, user.id), devices: listUserDevices(db, user.id) };
  });

  app.post('/api/dev/users', async (req): Promise<CreatedCredentials> => {
    const actor = dev(req);
    const body = z
      .object({
        role: z.enum(['developer', 'manager', 'worker']),
        companyId: z.number().int().positive().nullable().default(null),
        username: usernameSchema,
        fullName: nameSchema,
        phone: phoneSchema.default(''),
        employeeCode: z.string().trim().max(50).default(''),
        notes: z.string().max(2000).default(''),
        password: z.string().max(200).optional(),
        mustChangePassword: z.boolean().default(false),
      })
      .parse(req.body);
    if (body.role === 'developer' && body.companyId) throw badRequest('Developer accounts do not belong to a company.');
    if (body.role !== 'developer') {
      if (!body.companyId) throw badRequest('Choose a company.');
      getCompany(db, body.companyId);
    }
    if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(body.username)) {
      throw conflict('This username is already taken.', 'USERNAME_TAKEN');
    }
    const password = body.password?.length ? body.password : generatePassword();
    const problem = passwordProblem(password, body.username);
    if (problem) throw badRequest(problem, 'WEAK_PASSWORD');
    const now = nowIso();
    const id = Number(
      db
        .prepare(
          `INSERT INTO users (company_id, role, username, password_hash, full_name, phone, employee_code, notes,
             must_change_password, password_changed_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.role === 'developer' ? null : body.companyId,
          body.role,
          body.username,
          await hashPassword(password),
          body.fullName,
          body.phone,
          body.employeeCode,
          body.notes,
          body.mustChangePassword ? 1 : 0,
          now,
          now,
          now,
        ).lastInsertRowid,
    );
    audit(db, actor, 'user.create', {
      companyId: body.companyId,
      entity: 'user',
      entityId: id,
      summary: `Created ${body.role} account ${body.username} (${body.fullName})`,
    });
    return { user: getUserRecord(db, id), password };
  });

  app.patch('/api/dev/users/:id', async (req): Promise<UserRecord> => {
    const actor = dev(req);
    const before = getUser(db, idParam((req.params as { id: string }).id));
    const body = z
      .object({
        username: usernameSchema.optional(),
        fullName: nameSchema.optional(),
        phone: phoneSchema.optional(),
        employeeCode: z.string().trim().max(50).optional(),
        notes: z.string().max(2000).optional(),
        active: z.boolean().optional(),
        mustChangePassword: z.boolean().optional(),
      })
      .parse(req.body);
    if (body.username && body.username !== before.username.toLowerCase()) {
      if (db.prepare('SELECT 1 FROM users WHERE username = ? AND id <> ?').get(body.username, before.id)) {
        throw conflict('This username is already taken.', 'USERNAME_TAKEN');
      }
    }
    if (body.active === false && before.role === 'developer') {
      const others = db.prepare("SELECT count(*) AS n FROM users WHERE role = 'developer' AND active = 1 AND id <> ?").get(before.id) as { n: number };
      if (others.n === 0) throw badRequest('Keep at least one active developer account.');
    }
    db.prepare(
      `UPDATE users SET username = ?, full_name = ?, phone = ?, employee_code = ?, notes = ?, active = ?, must_change_password = ?,
         updated_at = ? WHERE id = ?`,
    ).run(
      body.username ?? before.username,
      body.fullName ?? before.full_name,
      body.phone ?? before.phone,
      body.employeeCode ?? before.employee_code,
      body.notes ?? before.notes,
      body.active === undefined ? before.active : body.active ? 1 : 0,
      body.mustChangePassword === undefined ? before.must_change_password : body.mustChangePassword ? 1 : 0,
      nowIso(),
      before.id,
    );
    if (body.active === false) revokeUserSessions(db, before.id);
    audit(db, actor, 'user.update', {
      companyId: before.company_id,
      entity: 'user',
      entityId: before.id,
      summary: `Updated ${before.full_name}${body.active === false ? ' (turned off)' : body.active === true ? ' (turned on)' : ''}`,
      details: {
        before: { username: before.username, fullName: before.full_name, phone: before.phone, active: !!before.active },
        changes: body,
      },
    });
    return getUserRecord(db, before.id);
  });

  app.post('/api/dev/users/:id/reset-password', async (req): Promise<CreatedCredentials> => {
    const actor = dev(req);
    const user = getUser(db, idParam((req.params as { id: string }).id));
    const body = z.object({ password: z.string().max(200).optional(), mustChangePassword: z.boolean().default(false) }).parse(req.body ?? {});
    const password = body.password?.length ? body.password : generatePassword();
    const problem = passwordProblem(password, user.username);
    if (problem) throw badRequest(problem, 'WEAK_PASSWORD');
    db.prepare(
      `UPDATE users SET password_hash = ?, must_change_password = ?, failed_logins = 0, locked_until = NULL,
         password_changed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(await hashPassword(password), body.mustChangePassword ? 1 : 0, nowIso(), nowIso(), user.id);
    revokeUserSessions(db, user.id);
    audit(db, actor, 'user.reset_password', {
      companyId: user.company_id,
      entity: 'user',
      entityId: user.id,
      summary: `Reset the password of ${user.full_name}`,
    });
    return { user: getUserRecord(db, user.id), password };
  });

  app.post('/api/dev/users/:id/:action', async (req): Promise<UserRecord> => {
    const actor = dev(req);
    const params = z
      .object({ id: z.coerce.number().int().positive(), action: z.enum(['unlock', 'logout-everywhere', 'reset-2fa']) })
      .parse(req.params);
    const user = getUser(db, params.id);
    if (params.action === 'unlock') {
      db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);
    } else if (params.action === 'logout-everywhere') {
      revokeUserSessions(db, user.id);
    } else {
      db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = NULL, totp_last_step = NULL WHERE id = ?').run(user.id);
    }
    audit(db, actor, `user.${params.action.replace(/-/g, '_')}`, {
      companyId: user.company_id,
      entity: 'user',
      entityId: user.id,
      summary: `${{ unlock: 'Unlocked', 'logout-everywhere': 'Signed out everywhere:', 'reset-2fa': 'Turned off two-step sign-in for' }[params.action]} ${user.full_name}`,
    });
    return getUserRecord(db, user.id);
  });

  app.delete('/api/dev/users/:id', async (req) => {
    const actor = dev(req);
    const user = getUser(db, idParam((req.params as { id: string }).id));
    const { confirmUsername } = z.object({ confirmUsername: z.string() }).parse(req.body ?? {});
    if (confirmUsername.trim().toLowerCase() !== user.username.toLowerCase()) throw badRequest('Type the username exactly to confirm.');
    if (user.id === req.auth!.user.id) throw badRequest('You cannot delete your own account.');
    if (user.role === 'developer') {
      const others = db.prepare("SELECT count(*) AS n FROM users WHERE role = 'developer' AND active = 1 AND id <> ?").get(user.id) as { n: number };
      if (others.n === 0) throw badRequest('Keep at least one active developer account.');
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    audit(db, actor, 'user.delete', {
      companyId: user.company_id,
      entity: 'user',
      entityId: user.id,
      summary: `Deleted ${user.role} ${user.username} (${user.full_name}) and all their data`,
    });
    return { ok: true };
  });

  app.post('/api/dev/devices/:id/:action', async (req) => {
    const actor = dev(req);
    const params = z.object({ id: z.coerce.number().int().positive(), action: z.enum(['approve', 'reject', 'revoke']) }).parse(req.params);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(params.id) as Parameters<typeof revokeDevice>[2] | undefined;
    if (!device) throw notFound('Phone not found.');
    if (params.action === 'revoke') revokeDevice(db, actor, device);
    else decideDevice(db, actor, device, params.action);
    return { ok: true };
  });

  // --- Logs, alerts and audit ----------------------------------------------------------------

  app.get('/api/dev/audit', async (req): Promise<Paged<AuditEntry>> => {
    dev(req);
    const q = z
      .object({
        companyId: z.coerce.number().int().positive().optional(),
        q: z.string().trim().max(100).optional(),
        before: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    const where = ['a.id < ?'];
    const args: unknown[] = [q.before ?? Number.MAX_SAFE_INTEGER];
    if (q.companyId) {
      where.push('a.company_id = ?');
      args.push(q.companyId);
    }
    if (q.q) {
      where.push("(a.summary LIKE ? ESCAPE '\\' OR a.actor_name LIKE ? ESCAPE '\\' OR a.action LIKE ? ESCAPE '\\')");
      const like = `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      args.push(like, like, like);
    }
    const rows = db
      .prepare(
        `SELECT a.*, c.name AS company_name FROM audit_log a LEFT JOIN companies c ON c.id = a.company_id
         WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT 101`,
      )
      .all(...args) as AuditRow[];
    return pageAudit(rows, 100);
  });

  app.get('/api/dev/security', async (req): Promise<Paged<SecurityEvent>> => {
    dev(req);
    const q = z
      .object({
        companyId: z.coerce.number().int().positive().optional(),
        severity: z.enum(['info', 'warn', 'high']).optional(),
        unresolved: z.enum(['0', '1']).optional(),
        before: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    const where = ['ev.id < ?'];
    const args: unknown[] = [q.before ?? Number.MAX_SAFE_INTEGER];
    if (q.companyId) {
      where.push('ev.company_id = ?');
      args.push(q.companyId);
    }
    if (q.severity) {
      where.push('ev.severity = ?');
      args.push(q.severity);
    }
    if (q.unresolved === '1') where.push('ev.resolved_at IS NULL');
    const rows = db
      .prepare(`${EVENT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ev.id DESC LIMIT 101`)
      .all(...args) as Parameters<typeof toSecurityEvent>[0][];
    const items = rows.slice(0, 100).map(toSecurityEvent);
    return { items, nextCursor: rows.length > 100 ? items[items.length - 1]!.id : null };
  });

  app.post('/api/dev/security/:id/resolve', async (req) => {
    const actor = dev(req);
    resolveSecurityEvent(db, actor, null, idParam((req.params as { id: string }).id));
    return { ok: true };
  });

  app.get('/api/dev/logs', async (req): Promise<Paged<SystemLog>> => {
    dev(req);
    const q = z
      .object({
        level: z.enum(['error', 'warn', 'info']).optional(),
        unresolved: z.enum(['0', '1']).optional(),
        before: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    const where = ['id < ?'];
    const args: unknown[] = [q.before ?? Number.MAX_SAFE_INTEGER];
    if (q.level) {
      where.push('level = ?');
      args.push(q.level);
    }
    if (q.unresolved === '1') where.push('resolved_at IS NULL');
    const rows = db
      .prepare(`SELECT * FROM system_logs WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 101`)
      .all(...args) as SystemLogRow[];
    const items = rows.slice(0, 100).map(toSystemLog);
    return { items, nextCursor: rows.length > 100 ? items[items.length - 1]!.id : null };
  });

  app.post('/api/dev/logs/resolve', async (req) => {
    dev(req);
    const { id } = z.object({ id: z.number().int().positive().optional() }).parse(req.body ?? {});
    const res = id
      ? db.prepare('UPDATE system_logs SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL').run(nowIso(), id)
      : db.prepare('UPDATE system_logs SET resolved_at = ? WHERE resolved_at IS NULL').run(nowIso());
    return { resolved: res.changes };
  });

  app.get('/api/dev/punches', async (req): Promise<Paged<PunchSummary & { workerName: string; companyName: string; companyId: number }>> => {
    dev(req);
    const q = z
      .object({
        companyId: z.coerce.number().int().positive().optional(),
        workerId: z.coerce.number().int().positive().optional(),
        result: z.enum(['accepted', 'review', 'rejected']).optional(),
        before: z.coerce.number().int().positive().optional(),
      })
      .parse(req.query);
    const where = ['q.id < ?'];
    const args: unknown[] = [q.before ?? Number.MAX_SAFE_INTEGER];
    if (q.companyId) {
      where.push('q.company_id = ?');
      args.push(q.companyId);
    }
    if (q.workerId) {
      where.push('q.worker_id = ?');
      args.push(q.workerId);
    }
    if (q.result) {
      where.push('q.result = ?');
      args.push(q.result);
    }
    const rows = db
      .prepare(
        `SELECT q.*, w.full_name AS worker_name, c.name AS company_name FROM (${PUNCH_SELECT}) q
         JOIN users w ON w.id = q.worker_id JOIN companies c ON c.id = q.company_id
         WHERE ${where.join(' AND ')} ORDER BY q.id DESC LIMIT 101`,
      )
      .all(...args) as Array<Parameters<typeof toPunchSummary>[0] & { worker_name: string; company_name: string }>;
    const items = rows.slice(0, 100).map((r) => ({
      ...toPunchSummary(r),
      workerName: r.worker_name,
      companyName: r.company_name,
      companyId: r.company_id,
    }));
    return { items, nextCursor: rows.length > 100 ? items[items.length - 1]!.id : null };
  });

  // --- Sessions, jobs, backups -----------------------------------------------------------------

  app.get('/api/dev/sessions', async (req): Promise<SessionInfo[]> => {
    dev(req);
    const rows = db
      .prepare(
        `SELECT s.*, u.full_name, u.username, u.role, c.name AS company_name FROM sessions s
         JOIN users u ON u.id = s.user_id LEFT JOIN companies c ON c.id = u.company_id
         WHERE s.revoked_at IS NULL AND s.expires_at > ? ORDER BY s.last_seen_at DESC LIMIT 500`,
      )
      .all(nowIso()) as Array<{
      id: string;
      user_id: number;
      full_name: string;
      username: string;
      role: UserRow['role'];
      company_name: string | null;
      created_at: string;
      last_seen_at: string;
      expires_at: string;
      ip: string;
      user_agent: string;
    }>;
    return rows.map((r) => ({
      id: r.id.slice(0, 16),
      userId: r.user_id,
      userName: r.full_name,
      username: r.username,
      role: r.role,
      companyName: r.company_name,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      expiresAt: r.expires_at,
      ip: r.ip,
      userAgent: r.user_agent,
    }));
  });

  app.post('/api/dev/sessions/:id/revoke', async (req) => {
    const actor = dev(req);
    const { id } = z.object({ id: z.string().regex(/^[a-f0-9]{16}$/) }).parse(req.params);
    const row = db.prepare("SELECT s.id, u.full_name, u.company_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id LIKE ? || '%'").get(id) as
      | { id: string; full_name: string; company_id: number | null }
      | undefined;
    if (!row) throw notFound('Session not found.');
    db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(nowIso(), row.id);
    audit(db, actor, 'session.revoke', { companyId: row.company_id, entity: 'session', summary: `Signed out a session of ${row.full_name}` });
    return { ok: true };
  });

  app.get('/api/dev/jobs', async (req): Promise<JobRun[]> => {
    dev(req);
    return jobs.list();
  });

  app.post('/api/dev/jobs/:name/run', async (req): Promise<JobRun> => {
    const actor = dev(req);
    const { name } = z.object({ name: z.enum(['attendance', 'cleanup', 'integrity', 'backup']) }).parse(req.params);
    audit(db, actor, 'job.run', { entity: 'job', entityId: name, summary: `Ran the ${name} job by hand` });
    return jobs.run(name);
  });

  app.get('/api/dev/backup', async (req, reply) => {
    const actor = dev(req);
    rateLimit(req, 'backup-download', 5, 60 * 60_000);
    const dir = path.join(config.dataDir, 'tmp');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `backup-${randomToken(8)}.db`);
    await db.backup(file);
    audit(db, actor, 'system.backup_download', { entity: 'system', summary: 'Downloaded a database backup' });
    const stream = fs.createReadStream(file);
    stream.on('close', () => fs.rm(file, { force: true }, () => undefined));
    reply
      .header('content-type', 'application/vnd.sqlite3')
      .header('content-disposition', `attachment; filename="onsite-backup-${nowIso().slice(0, 16).replace(/[:T]/g, '-')}.db"`)
      .header('cache-control', 'no-store');
    return reply.send(stream);
  });
}
