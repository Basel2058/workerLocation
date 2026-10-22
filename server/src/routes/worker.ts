import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  DeviceRegistrationResult,
  PresenceOutcome,
  PunchChallenge,
  PunchOutcome,
  SignedEnvelope,
  WorkerHistoryDay,
  WorkerHome,
  WorkerShift,
} from '../../../shared/types';
import type { CompanyRow, EntryRow } from '../db/rows';
import { idParam, rateLimit, requireAuth, requireRole } from '../http';
import { badRequest } from '../lib/errors';
import { addDays, dayRange, dateSpanRange, isValidDate, localDate, nowIso, todayLocal, weekStart } from '../lib/time';
import { createChallenge } from '../services/challenges';
import { companySettings } from '../services/companies';
import { deviceKeyState, registerDevice } from '../services/devices';
import { closeStaleEntries, entryMinutes, lateMinutes, openEntry } from '../services/entries';
import { pendingPresence, presenceChallenge, submitPresence } from '../services/presence';
import { issuePunchChallenge, submitPunch, type PunchContext } from '../services/punch';
import { listShifts, type ShiftListRow } from '../services/shifts';

export const DEVICE_COOKIE = 'onsite_dk';

const envelopeSchema = z.object({
  keyId: z.string().min(20).max(100),
  payload: z.string().min(2).max(1_200_000),
  signature: z.string().min(20).max(200),
});

const keyIdSchema = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/);

function workerContext(req: FastifyRequest): PunchContext {
  const auth = requireRole(req, 'worker');
  return {
    db: req.server.ctx.db,
    user: auth.user,
    company: auth.company!,
    ip: req.ip,
    userAgent: req.headers['user-agent'] ?? '',
  };
}

function headerKeyId(req: FastifyRequest): string | null {
  const raw = req.headers['x-device-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && keyIdSchema.safeParse(value).success ? value : null;
}

interface WorkerEntryRow extends EntryRow {
  site_name: string | null;
  shift_starts_at: string | null;
}

export default async function workerRoutes(app: FastifyInstance) {
  const { db, push, config } = app.ctx;

  function workerShifts(company: CompanyRow, workerId: number, start: string, end: string, now: string): WorkerShift[] {
    const shifts = listShifts(db, company.id, start, end, { workerId });
    const entries = db
      .prepare("SELECT * FROM time_entries WHERE worker_id = ? AND status <> 'void' AND shift_id IS NOT NULL AND clock_in_at < ?")
      .all(workerId, end) as EntryRow[];
    return shifts.map((s: ShiftListRow) => {
      const linked = entries.filter((e) => e.shift_id === s.id);
      const worked = linked.reduce((sum, e) => sum + (entryMinutes(e) ?? 0), 0);
      const state: WorkerShift['state'] =
        linked.some((e) => e.status === 'open') || (s.starts_at <= now && now < s.ends_at)
          ? 'now'
          : s.starts_at > now
            ? 'upcoming'
            : linked.length > 0
              ? 'worked'
              : 'missed';
      return {
        id: s.id,
        siteName: s.site_name,
        startsAt: s.starts_at,
        endsAt: s.ends_at,
        date: localDate(s.starts_at, company.timezone),
        note: s.note,
        state,
        workedMinutes: worked,
      };
    });
  }

  app.get('/api/worker/home', async (req): Promise<WorkerHome> => {
    const { user, company } = workerContext(req);
    const tz = company.timezone;
    const now = nowIso();
    closeStaleEntries(db, now, { workerId: user.id });

    const keyId = headerKeyId(req);
    const state = keyId ? deviceKeyState(db, user.id, keyId) : 'unknown';
    const deviceRow = keyId
      ? (db.prepare('SELECT label FROM devices WHERE key_id = ? AND user_id = ?').get(keyId, user.id) as { label: string } | undefined)
      : undefined;

    const open = openEntry(db, user.id);
    let openEntryInfo: WorkerHome['openEntry'] = null;
    if (open) {
      const site = open.site_id ? (db.prepare('SELECT name FROM sites WHERE id = ?').get(open.site_id) as { name: string } | undefined) : undefined;
      const shiftEnd = open.shift_id
        ? (db.prepare('SELECT ends_at FROM shifts WHERE id = ?').get(open.shift_id) as { ends_at: string } | undefined)
        : undefined;
      const pending = open.in_punch_id
        ? !!db.prepare("SELECT 1 FROM punches WHERE id = ? AND review_status = 'pending'").get(open.in_punch_id)
        : false;
      openEntryInfo = {
        id: open.id,
        clockInAt: open.clock_in_at,
        siteName: site?.name ?? null,
        needsReview: pending,
        shiftEndsAt: shiftEnd?.ends_at ?? null,
      };
    }

    const today = todayLocal(tz, now);
    const day = dayRange(today, tz);
    const todayShifts = workerShifts(company, user.id, day.start, day.end, now);
    const next = db
      .prepare('SELECT starts_at, ends_at FROM shifts WHERE worker_id = ? AND starts_at >= ? ORDER BY starts_at LIMIT 1')
      .get(user.id, day.end) as { starts_at: string; ends_at: string } | undefined;
    const nextShift = next ? (workerShifts(company, user.id, next.starts_at, next.ends_at, now)[0] ?? null) : null;

    const week = dateSpanRange(weekStart(today), addDays(weekStart(today), 6), tz);
    const weekRows = db
      .prepare("SELECT status, clock_in_at, clock_out_at FROM time_entries WHERE worker_id = ? AND status = 'closed' AND clock_in_at >= ? AND clock_in_at < ?")
      .all(user.id, week.start, week.end) as EntryRow[];

    const notices: string[] = [];
    const rejected = db
      .prepare(
        `SELECT type, at FROM punches WHERE worker_id = ? AND review_status = 'rejected' AND reviewed_at >= ?
         ORDER BY at DESC LIMIT 3`,
      )
      .all(user.id, new Date(Date.now() - 3 * 86_400_000).toISOString()) as Array<{ type: string; at: string }>;
    for (const r of rejected) {
      notices.push(
        `Your manager did not accept your check-${r.type} of ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(r.at))}.`,
      );
    }

    return {
      serverTime: now,
      timezone: tz,
      companyName: company.name,
      device: {
        status: state === 'unknown' || state === 'other_user' ? 'none' : state,
        label: deviceRow?.label ?? null,
      },
      openEntry: openEntryInfo,
      todayShifts,
      nextShift,
      weekMinutes: weekRows.reduce((sum, e) => sum + (entryMinutes(e) ?? 0), 0),
      presenceCheck: pendingPresence(db, user.id),
      notices,
    };
  });

  app.get('/api/worker/shifts', async (req): Promise<WorkerShift[]> => {
    const { user, company } = workerContext(req);
    const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(req.query);
    const today = todayLocal(company.timezone);
    const from = q.from && isValidDate(q.from) ? q.from : today;
    const to = q.to && isValidDate(q.to) ? q.to : addDays(from, 27);
    if (Date.parse(to) - Date.parse(from) > 120 * 86_400_000) throw badRequest('Choose at most 120 days.');
    const range = dateSpanRange(from, to, company.timezone);
    return workerShifts(company, user.id, range.start, range.end, nowIso());
  });

  app.get('/api/worker/history', async (req): Promise<WorkerHistoryDay[]> => {
    const { user, company } = workerContext(req);
    const tz = company.timezone;
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(120).default(30) }).parse(req.query);
    const since = dayRange(addDays(todayLocal(tz), -(days - 1)), tz).start;
    const rows = db
      .prepare(
        `SELECT e.*, s.name AS site_name, sh.starts_at AS shift_starts_at FROM time_entries e
         LEFT JOIN sites s ON s.id = e.site_id LEFT JOIN shifts sh ON sh.id = e.shift_id
         WHERE e.worker_id = ? AND e.status <> 'void' AND e.clock_in_at >= ? ORDER BY e.clock_in_at DESC`,
      )
      .all(user.id, since) as WorkerEntryRow[];
    const grace = companySettings(company).lateGraceMin;
    const pending = new Set(
      (
        db.prepare("SELECT entry_id FROM punches WHERE worker_id = ? AND review_status = 'pending' AND entry_id IS NOT NULL").all(user.id) as Array<{
          entry_id: number;
        }>
      ).map((r) => r.entry_id),
    );
    const byDate = new Map<string, WorkerHistoryDay>();
    for (const e of rows) {
      const date = localDate(e.clock_in_at, tz);
      const day = byDate.get(date) ?? { date, minutes: 0, entries: [] };
      const minutes = entryMinutes(e);
      day.minutes += minutes ?? 0;
      day.entries.push({
        id: e.id,
        clockInAt: e.clock_in_at,
        clockOutAt: e.clock_out_at,
        siteName: e.site_name,
        status: e.status,
        minutes,
        lateMinutes: lateMinutes(e.shift_starts_at, e.clock_in_at, grace),
        needsReview: pending.has(e.id),
      });
      byDate.set(date, day);
    }
    return [...byDate.values()];
  });

  // --- Phone registration -------------------------------------------------------------------

  app.post('/api/device/challenge', async (req) => {
    const { user } = workerContext(req);
    rateLimit(req, `device-challenge:${user.id}`, 20, 60 * 60_000);
    const challenge = createChallenge(db, { userId: user.id, deviceId: null, purpose: 'device' });
    return { nonce: challenge.nonce, expiresAt: challenge.expires_at };
  });

  app.post('/api/device/register', async (req, reply): Promise<DeviceRegistrationResult> => {
    const ctx = workerContext(req);
    rateLimit(req, `device-register:${ctx.user.id}`, 10, 24 * 60 * 60_000);
    const envelope = envelopeSchema.parse(req.body) as SignedEnvelope;
    const remembered = req.cookies[DEVICE_COOKIE];
    const result = registerDevice(
      { ...ctx, rememberedKeyId: remembered && keyIdSchema.safeParse(remembered).success ? remembered : null },
      envelope,
    );
    // Remember which key this browser holds, separately from its storage, to spot one phone used for many workers.
    reply.setCookie(DEVICE_COOKIE, envelope.keyId, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/api',
      maxAge: 400 * 86_400,
    });
    if (result.status === 'pending') {
      push.notifyManagers(ctx.company.id, {
        title: 'New phone needs approval',
        body: `${ctx.user.full_name} wants to use a new phone (${result.label}).`,
        url: '/m/requests',
        tag: `device-${result.deviceId}`,
      });
    }
    return result;
  });

  app.get('/api/device/status', async (req) => {
    const { user } = workerContext(req);
    const keyId = headerKeyId(req);
    const state = keyId ? deviceKeyState(db, user.id, keyId) : 'unknown';
    const hasActiveElsewhere = !!db
      .prepare("SELECT 1 FROM devices WHERE user_id = ? AND status = 'active' AND key_id IS NOT ?")
      .get(user.id, keyId);
    return { state, hasActiveElsewhere };
  });

  // --- Check in / out ------------------------------------------------------------------------

  app.post('/api/punch/challenge', async (req): Promise<PunchChallenge> => {
    const ctx = workerContext(req);
    const body = z.object({ type: z.enum(['in', 'out']), keyId: keyIdSchema }).parse(req.body);
    rateLimit(req, `punch-challenge:${ctx.user.id}`, 60, 60 * 60_000);
    return issuePunchChallenge(ctx, body.type, body.keyId);
  });

  app.post('/api/punch', { bodyLimit: 2_000_000 }, async (req): Promise<PunchOutcome> => {
    const ctx = workerContext(req);
    rateLimit(req, `punch:${ctx.user.id}`, 30, 60 * 60_000);
    const outcome = submitPunch(ctx, envelopeSchema.parse(req.body) as SignedEnvelope);
    if (outcome.result === 'review') {
      push.notifyManagers(ctx.company.id, {
        title: outcome.type === 'in' ? 'Check-in to review' : 'Check-out to review',
        body: `${ctx.user.full_name}: please confirm this ${outcome.type === 'in' ? 'check-in' : 'check-out'}.`,
        url: '/m/requests',
        tag: `punch-review-${ctx.user.id}`,
      });
    }
    return outcome;
  });

  app.post('/api/presence/:id/challenge', async (req): Promise<PunchChallenge> => {
    const ctx = workerContext(req);
    const { keyId } = z.object({ keyId: keyIdSchema }).parse(req.body);
    rateLimit(req, `presence-challenge:${ctx.user.id}`, 30, 60 * 60_000);
    return presenceChallenge(ctx, idParam((req.params as { id: string }).id), keyId);
  });

  app.post('/api/presence/:id', { bodyLimit: 2_000_000 }, async (req): Promise<PresenceOutcome> => {
    const ctx = workerContext(req);
    rateLimit(req, `presence:${ctx.user.id}`, 20, 60 * 60_000);
    const envelope = envelopeSchema.parse(req.body) as SignedEnvelope;
    const outcome = submitPresence(ctx, push, envelope);
    return outcome;
  });

  // --- Push notifications (all roles) ---------------------------------------------------------

  app.post('/api/push/subscribe', async (req) => {
    const auth = requireAuth(req);
    const body = z
      .object({
        endpoint: z.string().url().max(1000).refine((u) => u.startsWith('https://'), 'Must be https'),
        keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
      })
      .parse(req.body);
    rateLimit(req, `push-sub:${auth.user.id}`, 20, 60 * 60_000);
    push.subscribe(auth.user.id, body, req.headers['user-agent'] ?? '');
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (req) => {
    const auth = requireAuth(req);
    const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(req.body);
    push.unsubscribe(auth.user.id, endpoint);
    return { ok: true };
  });
}
