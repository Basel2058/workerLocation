import type { PunchSummary, TimeEntry } from '../../../shared/types';
import { parseJson, type DB } from '../db';
import type { CompanyRow, EntryRow, PunchRow, ShiftRow } from '../db/rows';
import { msg, tr } from '../i18n';
import { badRequest, conflict, notFound } from '../lib/errors';
import { addMinutes, minutesBetween, nowIso } from '../lib/time';
import { companySettings, getSite } from './companies';
import { audit, type Actor } from './logs';
import { findShiftForCheckIn } from './shifts';
import { getCompanyWorker } from './users';

export function openEntry(db: DB, workerId: number): EntryRow | null {
  return (
    (db.prepare("SELECT * FROM time_entries WHERE worker_id = ? AND status = 'open'").get(workerId) as
      | EntryRow
      | undefined) ?? null
  );
}

/**
 * Marks entries whose worker forgot to check out as "incomplete" (no end time, not counted) so the
 * manager can fix them. Deadline: shift end + grace, or a maximum open time when there was no shift.
 */
export function closeStaleEntries(db: DB, now: string, scope: { workerId?: number; companyId?: number } = {}): number {
  const where = ["e.status = 'open'"];
  const args: number[] = [];
  if (scope.workerId) {
    where.push('e.worker_id = ?');
    args.push(scope.workerId);
  }
  if (scope.companyId) {
    where.push('e.company_id = ?');
    args.push(scope.companyId);
  }
  const rows = db
    .prepare(
      `SELECT e.id, e.clock_in_at, sh.ends_at AS shift_ends_at, c.settings
       FROM time_entries e
       JOIN companies c ON c.id = e.company_id
       LEFT JOIN shifts sh ON sh.id = e.shift_id
       WHERE ${where.join(' AND ')}`,
    )
    .all(...args) as Array<{
    id: number;
    clock_in_at: string;
    shift_ends_at: string | null;
    settings: string;
  }>;
  let closed = 0;
  const mark = db.prepare("UPDATE time_entries SET status = 'incomplete', updated_at = ? WHERE id = ? AND status = 'open'");
  for (const row of rows) {
    const s = companySettings(row);
    const deadline = row.shift_ends_at
      ? addMinutes(row.shift_ends_at, s.missingCheckoutAfterMin)
      : addMinutes(row.clock_in_at, s.maxOpenHours * 60);
    if (now >= deadline) closed += mark.run(now, row.id).changes;
  }
  return closed;
}

interface PunchListRow extends PunchRow {
  site_name: string | null;
  reviewer_name: string | null;
  device_label: string | null;
}

export const PUNCH_SELECT = `
  SELECT p.*, s.name AS site_name, r.full_name AS reviewer_name, d.label AS device_label
  FROM punches p
  LEFT JOIN sites s ON s.id = p.site_id
  LEFT JOIN users r ON r.id = p.reviewed_by
  LEFT JOIN devices d ON d.id = p.device_id`;

export function toPunchSummary(row: PunchListRow): PunchSummary {
  return {
    id: row.id,
    type: row.type,
    result: row.result,
    at: row.at,
    lat: row.lat,
    lng: row.lng,
    accuracy: row.accuracy === null ? null : Math.round(row.accuracy),
    distanceM: row.distance_m === null ? null : Math.round(row.distance_m),
    siteName: row.site_name,
    flags: parseJson<string[]>(row.flags, []),
    riskScore: row.risk_score,
    reason: row.reason,
    note: row.note,
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedByName: row.reviewer_name,
    selfieId: row.selfie_id,
    networkMatch: !!row.network_match,
    deviceLabel: row.device_label,
    ip: row.ip,
  };
}

export function loadPunches(db: DB, ids: Array<number | null>): Map<number, PunchSummary> {
  const wanted = [...new Set(ids.filter((id): id is number => id !== null))];
  const map = new Map<number, PunchSummary>();
  for (let i = 0; i < wanted.length; i += 500) {
    const chunk = wanted.slice(i, i + 500);
    const rows = db.prepare(`${PUNCH_SELECT} WHERE p.id IN (${chunk.map(() => '?').join(',')})`).all(...chunk) as PunchListRow[];
    for (const row of rows) map.set(row.id, toPunchSummary(row));
  }
  return map;
}

export function getPunchSummary(db: DB, companyId: number, punchId: number): PunchSummary & { workerId: number; entryId: number | null } {
  const row = db.prepare(`${PUNCH_SELECT} WHERE p.id = ? AND p.company_id = ?`).get(punchId, companyId) as
    | PunchListRow
    | undefined;
  if (!row) throw notFound('Punch not found.');
  return { ...toPunchSummary(row), workerId: row.worker_id, entryId: row.entry_id };
}

export interface EntryListRow extends EntryRow {
  worker_name: string;
  site_name: string | null;
  shift_starts_at: string | null;
  shift_ends_at: string | null;
  edited_by_name: string | null;
}

export const ENTRY_SELECT = `
  SELECT e.*, w.full_name AS worker_name, s.name AS site_name,
    sh.starts_at AS shift_starts_at, sh.ends_at AS shift_ends_at, ed.full_name AS edited_by_name
  FROM time_entries e
  JOIN users w ON w.id = e.worker_id
  LEFT JOIN sites s ON s.id = e.site_id
  LEFT JOIN shifts sh ON sh.id = e.shift_id
  LEFT JOIN users ed ON ed.id = e.edited_by`;

export function entryMinutes(e: Pick<EntryRow, 'status' | 'clock_in_at' | 'clock_out_at'>): number | null {
  if (e.status !== 'closed' || !e.clock_out_at) return null;
  return Math.max(0, minutesBetween(e.clock_in_at, e.clock_out_at));
}

export function lateMinutes(shiftStartsAt: string | null, clockInAt: string, graceMin: number): number | null {
  if (!shiftStartsAt) return null;
  const late = minutesBetween(shiftStartsAt, clockInAt);
  return late > graceMin ? late : null;
}

export function toTimeEntries(db: DB, rows: EntryListRow[], graceMin: number): TimeEntry[] {
  const punches = loadPunches(db, rows.flatMap((r) => [r.in_punch_id, r.out_punch_id]));
  return rows.map((r) => {
    const inPunch = r.in_punch_id ? (punches.get(r.in_punch_id) ?? null) : null;
    const outPunch = r.out_punch_id ? (punches.get(r.out_punch_id) ?? null) : null;
    const flags = new Set([...(inPunch?.flags ?? []), ...(outPunch?.flags ?? [])]);
    return {
      id: r.id,
      workerId: r.worker_id,
      workerName: r.worker_name,
      siteId: r.site_id,
      siteName: r.site_name,
      shiftId: r.shift_id,
      shiftStartsAt: r.shift_starts_at,
      shiftEndsAt: r.shift_ends_at,
      clockInAt: r.clock_in_at,
      clockOutAt: r.clock_out_at,
      status: r.status,
      source: r.source,
      note: r.note,
      minutes: entryMinutes(r),
      lateMinutes: lateMinutes(r.shift_starts_at, r.clock_in_at, graceMin),
      needsReview: inPunch?.reviewStatus === 'pending' || outPunch?.reviewStatus === 'pending',
      flags: [...flags],
      editedByName: r.edited_by_name,
      editedAt: r.edited_at,
      inPunch,
      outPunch,
    };
  });
}

export function listEntries(
  db: DB,
  company: CompanyRow,
  filter: { start: string; end: string; workerId?: number; includeVoid?: boolean },
): TimeEntry[] {
  const where = ['e.company_id = ?', 'e.clock_in_at >= ?', 'e.clock_in_at < ?'];
  const args: unknown[] = [company.id, filter.start, filter.end];
  if (filter.workerId) {
    where.push('e.worker_id = ?');
    args.push(filter.workerId);
  }
  if (!filter.includeVoid) where.push("e.status <> 'void'");
  const rows = db
    .prepare(`${ENTRY_SELECT} WHERE ${where.join(' AND ')} ORDER BY e.clock_in_at DESC LIMIT 5000`)
    .all(...args) as EntryListRow[];
  return toTimeEntries(db, rows, companySettings(company).lateGraceMin);
}

export function getEntry(db: DB, company: CompanyRow, id: number): TimeEntry {
  const row = db.prepare(`${ENTRY_SELECT} WHERE e.id = ? AND e.company_id = ?`).get(id, company.id) as
    | EntryListRow
    | undefined;
  if (!row) throw notFound('Time entry not found.');
  return toTimeEntries(db, [row], companySettings(company).lateGraceMin)[0]!;
}

function getEntryRow(db: DB, companyId: number, id: number): EntryRow {
  const row = db.prepare('SELECT * FROM time_entries WHERE id = ? AND company_id = ?').get(id, companyId) as
    | EntryRow
    | undefined;
  if (!row) throw notFound('Time entry not found.');
  return row;
}

function assertNoOverlap(db: DB, workerId: number, start: string, end: string | null, excludeId?: number): void {
  const clash = db
    .prepare(
      `SELECT id, clock_in_at FROM time_entries
       WHERE worker_id = ? AND status <> 'void' AND id IS NOT ?
         AND clock_in_at < ? AND coalesce(clock_out_at, ?) > ?`,
    )
    .get(workerId, excludeId ?? null, end ?? '9999-12-31T00:00:00.000Z', '9999-12-31T00:00:00.000Z', start) as
    | { id: number; clock_in_at: string }
    | undefined;
  if (clash) throw conflict('This overlaps another time entry of the same worker.', 'ENTRY_OVERLAP', { entryId: clash.id });
}

function assertNotFuture(iso: string): void {
  if (iso > addMinutes(nowIso(), 1)) throw badRequest('Times cannot be in the future.');
}

/** Picks the shift an entry belongs to, preferring one that covers the clock-in time. */
function matchShift(db: DB, workerId: number, clockInAt: string, earlyMin: number): ShiftRow | null {
  return findShiftForCheckIn(db, workerId, clockInAt, earlyMin);
}

export interface ManualEntryInput {
  workerId: number;
  siteId: number;
  clockInAt: string;
  clockOutAt: string | null;
  reason: string;
}

/** Manager adds attendance by hand (forgotten phone, worker without a smartphone, system mistakes). */
export function createManualEntry(db: DB, actor: Actor, company: CompanyRow, input: ManualEntryInput): TimeEntry {
  const worker = getCompanyWorker(db, company.id, input.workerId);
  const site = getSite(db, company.id, input.siteId);
  if (input.clockOutAt && input.clockOutAt < input.clockInAt) throw badRequest('Check-out must be after check-in.');
  assertNotFuture(input.clockInAt);
  if (input.clockOutAt) assertNotFuture(input.clockOutAt);
  if (!input.clockOutAt && openEntry(db, worker.id)) throw conflict(tr('{name} is already checked in.', { name: worker.full_name }), 'ALREADY_IN');
  assertNoOverlap(db, worker.id, input.clockInAt, input.clockOutAt);
  const settings = companySettings(company);
  const shift = matchShift(db, worker.id, input.clockInAt, settings.earlyCheckInMin);
  const now = nowIso();
  const id = db.transaction(() => {
    const newId = Number(
      db
        .prepare(
          `INSERT INTO time_entries (company_id, worker_id, site_id, shift_id, clock_in_at, clock_out_at, status, source, note,
             edited_by, edited_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, ?, ?, ?)`,
        )
        .run(
          company.id,
          worker.id,
          site.id,
          shift?.id ?? null,
          input.clockInAt,
          input.clockOutAt,
          input.clockOutAt ? 'closed' : 'open',
          input.reason,
          actor.id,
          now,
          now,
          now,
        ).lastInsertRowid,
    );
    audit(db, actor, 'entry.create', {
      companyId: company.id,
      entity: 'time_entry',
      entityId: newId,
      summary: input.clockOutAt
        ? msg('Added attendance for {name}: {from} – {to}', {
            name: worker.full_name,
            from: { at: input.clockInAt, tz: company.timezone },
            to: { at: input.clockOutAt, tz: company.timezone, style: 'time' },
          })
        : msg('Added attendance for {name}: {from} (checked in)', {
            name: worker.full_name,
            from: { at: input.clockInAt, tz: company.timezone },
          }),
      details: { ...input },
    });
    return newId;
  })();
  return getEntry(db, company, id);
}

export interface EntryPatch {
  clockInAt?: string;
  clockOutAt?: string | null;
  siteId?: number;
  reason: string;
}

/** Corrects an entry. The original punches stay untouched as evidence; the audit log keeps before/after. */
export function updateEntry(db: DB, actor: Actor, company: CompanyRow, id: number, patch: EntryPatch): TimeEntry {
  const before = getEntryRow(db, company.id, id);
  if (before.status === 'void') throw conflict('This entry was removed. Restore it first.', 'ENTRY_VOID');
  const clockInAt = patch.clockInAt ?? before.clock_in_at;
  const clockOutAt = patch.clockOutAt === undefined ? before.clock_out_at : patch.clockOutAt;
  if (clockOutAt && clockOutAt < clockInAt) throw badRequest('Check-out must be after check-in.');
  assertNotFuture(clockInAt);
  if (clockOutAt) assertNotFuture(clockOutAt);
  if (patch.siteId) getSite(db, company.id, patch.siteId);
  assertNoOverlap(db, before.worker_id, clockInAt, clockOutAt, id);

  let status: EntryRow['status'] = before.status;
  if (clockOutAt) status = 'closed';
  else if (before.status === 'closed') {
    // Removing the end time re-opens the entry only if the worker has no other open entry.
    status = openEntry(db, before.worker_id) ? 'incomplete' : 'open';
  }

  let shiftId = before.shift_id;
  if (clockInAt !== before.clock_in_at) {
    shiftId = matchShift(db, before.worker_id, clockInAt, companySettings(company).earlyCheckInMin)?.id ?? null;
  }

  const now = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE time_entries SET clock_in_at = ?, clock_out_at = ?, site_id = ?, shift_id = ?, status = ?,
         edited_by = ?, edited_at = ?, updated_at = ? WHERE id = ?`,
    ).run(clockInAt, clockOutAt, patch.siteId ?? before.site_id, shiftId, status, actor.id, now, now, id);
    const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(before.worker_id) as { full_name: string };
    audit(db, actor, 'entry.update', {
      companyId: company.id,
      entity: 'time_entry',
      entityId: id,
      summary: clockOutAt
        ? msg('Corrected {name}’s attendance: {from} – {to}', {
            name: worker.full_name,
            from: { at: clockInAt, tz: company.timezone },
            to: { at: clockOutAt, tz: company.timezone, style: 'time' },
          })
        : msg('Corrected {name}’s attendance: {from} (still checked in)', {
            name: worker.full_name,
            from: { at: clockInAt, tz: company.timezone },
          }),
      details: {
        reason: patch.reason,
        before: { clockInAt: before.clock_in_at, clockOutAt: before.clock_out_at, siteId: before.site_id, status: before.status },
        after: { clockInAt, clockOutAt, siteId: patch.siteId ?? before.site_id, status },
      },
    });
  })();
  return getEntry(db, company, id);
}

export function voidEntry(db: DB, actor: Actor, company: CompanyRow, id: number, reason: string): void {
  const before = getEntryRow(db, company.id, id);
  if (before.status === 'void') return;
  db.prepare("UPDATE time_entries SET status = 'void', edited_by = ?, edited_at = ?, updated_at = ? WHERE id = ?").run(
    actor.id,
    nowIso(),
    nowIso(),
    id,
  );
  const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(before.worker_id) as { full_name: string };
  audit(db, actor, 'entry.void', {
    companyId: company.id,
    entity: 'time_entry',
    entityId: id,
    summary: msg('Removed {name}’s attendance of {at}', { name: worker.full_name, at: { at: before.clock_in_at, tz: company.timezone } }),
    details: { reason, before: { status: before.status, clockInAt: before.clock_in_at, clockOutAt: before.clock_out_at } },
  });
}

export function restoreEntry(db: DB, actor: Actor, company: CompanyRow, id: number, reason: string): TimeEntry {
  const before = getEntryRow(db, company.id, id);
  if (before.status !== 'void') return getEntry(db, company, id);
  assertNoOverlap(db, before.worker_id, before.clock_in_at, before.clock_out_at, id);
  const status = before.clock_out_at ? 'closed' : 'incomplete';
  db.prepare('UPDATE time_entries SET status = ?, edited_by = ?, edited_at = ?, updated_at = ? WHERE id = ?').run(
    status,
    actor.id,
    nowIso(),
    nowIso(),
    id,
  );
  audit(db, actor, 'entry.restore', {
    companyId: company.id,
    entity: 'time_entry',
    entityId: id,
    summary: msg('Restored attendance entry #{id}', { id }),
    details: { reason, status },
  });
  return getEntry(db, company, id);
}

/** Manager decision on a punch that was sent for review. */
export function reviewPunch(
  db: DB,
  actor: Actor,
  company: CompanyRow,
  punchId: number,
  decision: 'approve' | 'reject',
  note: string,
): void {
  const punch = db.prepare('SELECT * FROM punches WHERE id = ? AND company_id = ?').get(punchId, company.id) as
    | PunchRow
    | undefined;
  if (!punch) throw notFound('Punch not found.');
  if (punch.review_status !== 'pending') throw conflict('This was already reviewed.', 'ALREADY_DECIDED');
  const now = nowIso();
  const worker = db.prepare('SELECT full_name FROM users WHERE id = ?').get(punch.worker_id) as { full_name: string };
  db.transaction(() => {
    db.prepare('UPDATE punches SET review_status = ?, reviewed_by = ?, reviewed_at = ?, review_note = ? WHERE id = ?').run(
      decision === 'approve' ? 'approved' : 'rejected',
      actor.id,
      now,
      note,
      punchId,
    );
    if (decision === 'reject' && punch.entry_id) {
      const entry = db.prepare('SELECT * FROM time_entries WHERE id = ?').get(punch.entry_id) as EntryRow | undefined;
      if (entry && entry.status !== 'void') {
        if (punch.type === 'in') {
          db.prepare("UPDATE time_entries SET status = 'void', updated_at = ? WHERE id = ?").run(now, entry.id);
        } else if (entry.out_punch_id === punch.id) {
          db.prepare(
            "UPDATE time_entries SET status = 'incomplete', clock_out_at = NULL, out_punch_id = NULL, updated_at = ? WHERE id = ?",
          ).run(now, entry.id);
        }
      }
    }
    audit(db, actor, decision === 'approve' ? 'punch.approve' : 'punch.reject', {
      companyId: company.id,
      entity: 'punch',
      entityId: punchId,
      summary: msg(
        decision === 'approve'
          ? punch.type === 'in'
            ? 'Accepted {name}’s check-in of {at}'
            : 'Accepted {name}’s check-out of {at}'
          : punch.type === 'in'
            ? 'Rejected {name}’s check-in of {at}'
            : 'Rejected {name}’s check-out of {at}',
        { name: worker.full_name, at: { at: punch.at, tz: company.timezone } },
      ),
      details: { note, entryId: punch.entry_id, flags: parseJson<string[]>(punch.flags, []) },
    });
  })();
}
