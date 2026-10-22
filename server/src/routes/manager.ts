import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  AuditEntry,
  LiveResponse,
  ManagerOverview,
  Paged,
  PresenceCheck,
  ReviewQueue,
  Shift,
  TeamMember,
  TimeEntry,
  TimesheetResponse,
} from '../../../shared/types';
import { parseJson } from '../db';
import type { PunchRow } from '../db/rows';
import { companyScope, idParam, rateLimit, requireAuth } from '../http';
import { renderStored, tr } from '../i18n';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { addDays, dateSpanRange, isValidClock, isValidDate, localDateTimeToUtc, nowIso, todayLocal } from '../lib/time';
import { listSites, toCompany, toSite } from '../services/companies';
import { decideDevice, getCompanyDevice, listUserDevices, revokeDevice } from '../services/devices';
import {
  createManualEntry,
  getEntry,
  getPunchSummary,
  listEntries,
  restoreEntry,
  reviewPunch,
  updateEntry,
  voidEntry,
} from '../services/entries';
import { getLive } from '../services/live';
import { latestPresenceByWorker, requestPresence } from '../services/presence';
import { getReviewQueue, pendingReviewCount, resolveSecurityEvent } from '../services/reviews';
import { copyWeek, createShifts, deleteShift, getShiftRow, listShifts, toShift, updateShift } from '../services/shifts';
import { getTimesheet, timesheetEntriesCsv, timesheetSummaryCsv } from '../services/timesheets';
import { getCompanyWorker, getUserRecord } from '../services/users';

const dateSchema = z.string().refine(isValidDate, 'Invalid date');
const clockSchema = z.string().refine(isValidClock, 'Invalid time');

function dateRange(req: FastifyRequest, tz: string, maxDays = 370) {
  const q = z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).parse(req.query);
  const today = todayLocal(tz);
  const from = q.from ?? addDays(today, -6);
  const to = q.to ?? today;
  if (to < from) throw badRequest('The end date is before the start date.');
  if (Date.parse(to) - Date.parse(from) > maxDays * 86_400_000) throw badRequest(tr('Choose at most {count} days.', { count: maxDays }));
  return { from, to, ...dateSpanRange(from, to, tz) };
}

function localInstant(value: string, tz: string, label: string): string {
  const iso = localDateTimeToUtc(value, tz);
  if (!iso) throw badRequest('Invalid date or time.', 'BAD_REQUEST', { field: label });
  return iso;
}

export default async function managerRoutes(app: FastifyInstance) {
  const { db, push } = app.ctx;

  app.get('/api/m/overview', async (req): Promise<ManagerOverview> => {
    const { company } = companyScope(req);
    return {
      company: toCompany(company),
      sites: listSites(db, company.id).map(toSite),
      pendingReviews: pendingReviewCount(db, company.id),
    };
  });

  app.get('/api/m/live', async (req): Promise<LiveResponse> => {
    const { company } = companyScope(req);
    const { siteId } = z.object({ siteId: z.coerce.number().int().positive().optional() }).parse(req.query);
    return getLive(db, company, { siteId });
  });

  app.get('/api/m/team', async (req): Promise<TeamMember[]> => {
    const { company } = companyScope(req);
    const rows = db
      .prepare(
        `SELECT u.id, u.full_name, u.username, u.phone, u.employee_code, u.active,
           (SELECT status FROM devices d WHERE d.user_id = u.id AND d.status IN ('active', 'pending') ORDER BY d.status = 'active' DESC, d.id DESC LIMIT 1) AS device_status,
           (SELECT label FROM devices d WHERE d.user_id = u.id AND d.status IN ('active', 'pending') ORDER BY d.status = 'active' DESC, d.id DESC LIMIT 1) AS device_label,
           (SELECT last_used_at FROM devices d WHERE d.user_id = u.id AND d.status = 'active' LIMIT 1) AS device_last_used,
           (SELECT 1 FROM push_subscriptions ps WHERE ps.user_id = u.id LIMIT 1) AS push
         FROM users u WHERE u.company_id = ? AND u.role = 'worker'
         ORDER BY u.active DESC, u.full_name COLLATE NOCASE`,
      )
      .all(company.id) as Array<{
      id: number;
      full_name: string;
      username: string;
      phone: string;
      employee_code: string;
      active: number;
      device_status: 'active' | 'pending' | null;
      device_label: string | null;
      device_last_used: string | null;
      push: number | null;
    }>;
    const lastEntries = db
      .prepare(
        `SELECT e.worker_id, e.clock_in_at, e.clock_out_at, s.name AS site_name FROM time_entries e
         LEFT JOIN sites s ON s.id = e.site_id
         WHERE e.id IN (SELECT max(id) FROM time_entries WHERE company_id = ? AND status <> 'void' GROUP BY worker_id)`,
      )
      .all(company.id) as Array<{ worker_id: number; clock_in_at: string; clock_out_at: string | null; site_name: string | null }>;
    return rows.map((r) => {
      const last = lastEntries.find((e) => e.worker_id === r.id);
      return {
        id: r.id,
        fullName: r.full_name,
        username: r.username,
        phone: r.phone,
        employeeCode: r.employee_code,
        active: !!r.active,
        device: { status: r.device_status ?? 'none', label: r.device_label, lastUsedAt: r.device_last_used },
        lastEntry: last ? { clockInAt: last.clock_in_at, clockOutAt: last.clock_out_at, siteName: last.site_name } : null,
        pushEnabled: !!r.push,
      };
    });
  });

  app.get('/api/m/workers/:id', async (req) => {
    const { company } = companyScope(req);
    const worker = getCompanyWorker(db, company.id, idParam((req.params as { id: string }).id));
    const tz = company.timezone;
    const today = todayLocal(tz);
    const recent = dateSpanRange(addDays(today, -13), today, tz);
    const upcoming = dateSpanRange(today, addDays(today, 13), tz);
    const presence = latestPresenceByWorker(db, company.id, recent.start).get(worker.id)?.check ?? null;
    return {
      worker: getUserRecord(db, worker.id),
      devices: listUserDevices(db, worker.id),
      recentEntries: listEntries(db, company, { start: recent.start, end: recent.end, workerId: worker.id }),
      upcomingShifts: listShifts(db, company.id, nowIso(), upcoming.end, { workerId: worker.id }).map((s) => toShift(s, tz)),
      presence,
    };
  });

  // --- Requests & alerts ----------------------------------------------------------------------

  app.get('/api/m/reviews', async (req): Promise<ReviewQueue> => getReviewQueue(db, companyScope(req).company));

  app.post('/api/m/devices/:id/:action', async (req) => {
    const { company, actor } = companyScope(req);
    const params = z.object({ id: z.coerce.number().int().positive(), action: z.enum(['approve', 'reject', 'revoke']) }).parse(req.params);
    const device = getCompanyDevice(db, company.id, params.id);
    if (params.action === 'revoke') revokeDevice(db, actor, device);
    else decideDevice(db, actor, device, params.action);
    return { ok: true };
  });

  app.get('/api/m/punches/:id', async (req) => {
    const { company } = companyScope(req);
    const id = idParam((req.params as { id: string }).id);
    const summary = getPunchSummary(db, company.id, id);
    const raw = db.prepare('SELECT samples, client FROM punches WHERE id = ?').get(id) as Pick<PunchRow, 'samples' | 'client'>;
    return { ...summary, samples: parseJson(raw.samples, []), client: parseJson(raw.client, {}) };
  });

  app.post('/api/m/punches/:id/review', async (req) => {
    const { company, actor } = companyScope(req);
    const body = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().max(500).default('') }).parse(req.body);
    reviewPunch(db, actor, company, idParam((req.params as { id: string }).id), body.decision, body.note.trim());
    return { ok: true };
  });

  app.post('/api/m/alerts/:id/resolve', async (req) => {
    const { company, actor } = companyScope(req);
    resolveSecurityEvent(db, actor, company.id, idParam((req.params as { id: string }).id));
    return { ok: true };
  });

  app.post('/api/m/presence', async (req): Promise<PresenceCheck> => {
    const { company, actor, auth } = companyScope(req);
    const { workerId } = z.object({ workerId: z.number().int().positive() }).parse(req.body);
    rateLimit(req, `presence-request:${auth.user.id}`, 60, 60 * 60_000);
    return requestPresence(db, push, actor, company, workerId);
  });

  // --- Shifts ---------------------------------------------------------------------------------

  app.get('/api/m/shifts', async (req): Promise<Shift[]> => {
    const { company } = companyScope(req);
    const range = dateRange(req, company.timezone, 62);
    const q = z
      .object({ siteId: z.coerce.number().int().positive().optional(), workerId: z.coerce.number().int().positive().optional() })
      .parse(req.query);
    return listShifts(db, company.id, range.start, range.end, q)
      .filter((s) => s.starts_at >= range.start)
      .map((s) => toShift(s, company.timezone));
  });

  app.post('/api/m/shifts', async (req): Promise<Shift[]> => {
    const { company, actor } = companyScope(req);
    const body = z
      .object({
        workerIds: z.array(z.number().int().positive()).min(1).max(500),
        siteId: z.number().int().positive(),
        dates: z.array(dateSchema).min(1).max(62),
        start: clockSchema,
        end: clockSchema,
        note: z.string().trim().max(300).default(''),
      })
      .parse(req.body);
    const rows = createShifts(db, actor, company, body);
    return rows.map((r) => toShift(getShiftRow(db, company.id, r.id), company.timezone));
  });

  app.patch('/api/m/shifts/:id', async (req): Promise<Shift> => {
    const { company, actor } = companyScope(req);
    const body = z
      .object({
        siteId: z.number().int().positive().optional(),
        workerId: z.number().int().positive().optional(),
        date: dateSchema.optional(),
        start: clockSchema.optional(),
        end: clockSchema.optional(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    return toShift(updateShift(db, actor, company, idParam((req.params as { id: string }).id), body), company.timezone);
  });

  app.delete('/api/m/shifts/:id', async (req) => {
    const { company, actor } = companyScope(req);
    deleteShift(db, actor, company, idParam((req.params as { id: string }).id));
    return { ok: true };
  });

  app.post('/api/m/shifts/copy-week', async (req) => {
    const { company, actor } = companyScope(req);
    const body = z.object({ from: dateSchema, to: dateSchema }).parse(req.body);
    return copyWeek(db, actor, company, body.from, body.to);
  });

  // --- Attendance -----------------------------------------------------------------------------

  app.get('/api/m/timesheets', async (req): Promise<TimesheetResponse> => {
    const { company } = companyScope(req);
    const range = dateRange(req, company.timezone);
    return getTimesheet(db, company, range.from, range.to).response;
  });

  app.get('/api/m/entries', async (req): Promise<TimeEntry[]> => {
    const { company } = companyScope(req);
    const range = dateRange(req, company.timezone);
    const q = z
      .object({ workerId: z.coerce.number().int().positive().optional(), includeVoid: z.enum(['0', '1']).optional() })
      .parse(req.query);
    return listEntries(db, company, { start: range.start, end: range.end, workerId: q.workerId, includeVoid: q.includeVoid === '1' });
  });

  app.get('/api/m/entries/:id', async (req): Promise<TimeEntry> => {
    const { company } = companyScope(req);
    return getEntry(db, company, idParam((req.params as { id: string }).id));
  });

  app.post('/api/m/entries', async (req): Promise<TimeEntry> => {
    const { company, actor } = companyScope(req);
    const body = z
      .object({
        workerId: z.number().int().positive(),
        siteId: z.number().int().positive(),
        clockIn: z.string(),
        clockOut: z.string().nullable(),
        reason: z.string().trim().min(3, 'Please write a short reason.').max(500),
      })
      .parse(req.body);
    const tz = company.timezone;
    return createManualEntry(db, actor, company, {
      workerId: body.workerId,
      siteId: body.siteId,
      clockInAt: localInstant(body.clockIn, tz, 'check-in time'),
      clockOutAt: body.clockOut ? localInstant(body.clockOut, tz, 'check-out time') : null,
      reason: body.reason,
    });
  });

  app.patch('/api/m/entries/:id', async (req): Promise<TimeEntry> => {
    const { company, actor } = companyScope(req);
    const body = z
      .object({
        clockIn: z.string().optional(),
        clockOut: z.string().nullable().optional(),
        siteId: z.number().int().positive().optional(),
        reason: z.string().trim().min(3, 'Please write a short reason.').max(500),
      })
      .parse(req.body);
    const tz = company.timezone;
    return updateEntry(db, actor, company, idParam((req.params as { id: string }).id), {
      clockInAt: body.clockIn ? localInstant(body.clockIn, tz, 'check-in time') : undefined,
      clockOutAt: body.clockOut === undefined ? undefined : body.clockOut === null ? null : localInstant(body.clockOut, tz, 'check-out time'),
      siteId: body.siteId,
      reason: body.reason,
    });
  });

  app.post('/api/m/entries/:id/void', async (req) => {
    const { company, actor } = companyScope(req);
    const { reason } = z.object({ reason: z.string().trim().min(3, 'Please write a short reason.').max(500) }).parse(req.body);
    voidEntry(db, actor, company, idParam((req.params as { id: string }).id), reason);
    return { ok: true };
  });

  app.post('/api/m/entries/:id/restore', async (req): Promise<TimeEntry> => {
    const { company, actor } = companyScope(req);
    const { reason } = z.object({ reason: z.string().trim().min(3, 'Please write a short reason.').max(500) }).parse(req.body);
    return restoreEntry(db, actor, company, idParam((req.params as { id: string }).id), reason);
  });

  app.get('/api/m/export/:kind', async (req, reply) => {
    const { company } = companyScope(req);
    const { kind } = z.object({ kind: z.enum(['summary.csv', 'entries.csv']) }).parse(req.params);
    const range = dateRange(req, company.timezone);
    const data = getTimesheet(db, company, range.from, range.to);
    const csv = kind === 'summary.csv' ? timesheetSummaryCsv(data) : timesheetEntriesCsv(data, company.timezone);
    const safeName = company.name.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'company';
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${safeName}-${kind.replace('.csv', '')}-${range.from}-to-${range.to}.csv"`)
      .header('cache-control', 'no-store');
    return csv;
  });

  app.get('/api/m/audit', async (req): Promise<Paged<AuditEntry>> => {
    const { company } = companyScope(req);
    const q = z.object({ before: z.coerce.number().int().positive().optional() }).parse(req.query);
    const rows = db
      .prepare(
        `SELECT a.*, c.name AS company_name FROM audit_log a LEFT JOIN companies c ON c.id = a.company_id
         WHERE a.company_id = ? AND a.id < ? ORDER BY a.id DESC LIMIT 51`,
      )
      .all(company.id, q.before ?? Number.MAX_SAFE_INTEGER) as AuditRow[];
    return pageAudit(rows, 50);
  });

  // Selfies are served only to the worker themselves, their company's managers and the developer.
  app.get('/api/selfies/:id', async (req, reply) => {
    const auth = requireAuth(req);
    const { id } = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{10,40}$/) }).parse(req.params);
    const row = db.prepare('SELECT * FROM selfies WHERE id = ?').get(id) as
      | { company_id: number; user_id: number; mime: string; data: Buffer }
      | undefined;
    if (!row) throw notFound('Photo not found or deleted.');
    const allowed =
      auth.user.role === 'developer' ||
      (auth.user.role === 'manager' && auth.user.company_id === row.company_id) ||
      (auth.user.role === 'worker' && auth.user.id === row.user_id);
    if (!allowed) throw forbidden();
    reply.header('content-type', row.mime).header('cache-control', 'private, max-age=86400, immutable');
    return reply.send(row.data);
  });
}

export interface AuditRow {
  id: number;
  at: string;
  actor_id: number | null;
  actor_name: string;
  actor_role: string;
  company_id: number | null;
  company_name: string | null;
  action: string;
  entity: string;
  entity_id: string;
  summary: string;
  summary_i18n: string | null;
  details: string;
  ip: string;
}

export function pageAudit(rows: AuditRow[], limit: number): Paged<AuditEntry> {
  const items = rows.slice(0, limit).map((r) => ({
    id: r.id,
    at: r.at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    actorRole: r.actor_role,
    companyId: r.company_id,
    companyName: r.company_name,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    summary: renderStored(r.summary, r.summary_i18n),
    details: parseJson<Record<string, unknown>>(r.details, {}),
    ip: r.ip,
  }));
  return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null };
}
