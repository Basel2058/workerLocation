import type { Shift } from '../../../shared/types';
import type { DB } from '../db';
import type { CompanyRow, ShiftRow, UserRow } from '../db/rows';
import { badRequest, conflict, notFound } from '../lib/errors';
import { addDays, addMinutes, formatLocal, localDate, localTime, nowIso, zonedToUtc } from '../lib/time';
import { getSite } from './companies';
import { audit, type Actor } from './logs';

export interface ShiftListRow extends ShiftRow {
  site_name: string;
  worker_name: string;
}

const SHIFT_SELECT = `
  SELECT sh.*, s.name AS site_name, w.full_name AS worker_name
  FROM shifts sh
  JOIN sites s ON s.id = sh.site_id
  JOIN users w ON w.id = sh.worker_id`;

export function toShift(row: ShiftListRow, tz: string): Shift {
  return {
    id: row.id,
    companyId: row.company_id,
    siteId: row.site_id,
    siteName: row.site_name,
    workerId: row.worker_id,
    workerName: row.worker_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    date: localDate(row.starts_at, tz),
    note: row.note,
  };
}

export function getShiftRow(db: DB, companyId: number, id: number): ShiftListRow {
  const row = db.prepare(`${SHIFT_SELECT} WHERE sh.id = ? AND sh.company_id = ?`).get(id, companyId) as
    | ShiftListRow
    | undefined;
  if (!row) throw notFound('Shift not found.');
  return row;
}

/** Shifts overlapping [start, end). */
export function listShifts(
  db: DB,
  companyId: number,
  start: string,
  end: string,
  filter: { workerId?: number; siteId?: number } = {},
): ShiftListRow[] {
  const where = ['sh.company_id = ?', 'sh.starts_at < ?', 'sh.ends_at > ?'];
  const args: unknown[] = [companyId, end, start];
  if (filter.workerId) {
    where.push('sh.worker_id = ?');
    args.push(filter.workerId);
  }
  if (filter.siteId) {
    where.push('sh.site_id = ?');
    args.push(filter.siteId);
  }
  return db
    .prepare(`${SHIFT_SELECT} WHERE ${where.join(' AND ')} ORDER BY sh.starts_at, w.full_name COLLATE NOCASE`)
    .all(...args) as ShiftListRow[];
}

/**
 * The shift a check-in belongs to: one that is running now or starts within the early window.
 * When several qualify, the one whose start is closest to now wins.
 */
export function findShiftForCheckIn(db: DB, workerId: number, now: string, earlyMin: number): ShiftRow | null {
  const rows = db
    .prepare('SELECT * FROM shifts WHERE worker_id = ? AND starts_at <= ? AND ends_at > ? ORDER BY starts_at')
    .all(workerId, addMinutes(now, earlyMin), now) as ShiftRow[];
  if (rows.length === 0) return null;
  const t = Date.parse(now);
  return rows.reduce((a, b) => (Math.abs(Date.parse(b.starts_at) - t) < Math.abs(Date.parse(a.starts_at) - t) ? b : a));
}

/** Converts local date + times to a UTC range; an end at or before the start means the shift ends the next day. */
export function shiftRange(date: string, start: string, end: string, tz: string): { startsAt: string; endsAt: string } {
  const startsAt = zonedToUtc(date, start, tz);
  let endsAt = zonedToUtc(date, end, tz);
  if (endsAt <= startsAt) endsAt = zonedToUtc(addDays(date, 1), end, tz);
  return { startsAt, endsAt };
}

function overlapping(db: DB, workerId: number, startsAt: string, endsAt: string, excludeId?: number): ShiftRow | undefined {
  return db
    .prepare('SELECT * FROM shifts WHERE worker_id = ? AND starts_at < ? AND ends_at > ? AND id IS NOT ? LIMIT 1')
    .get(workerId, endsAt, startsAt, excludeId ?? null) as ShiftRow | undefined;
}

function companyWorkers(db: DB, companyId: number, ids: number[]): UserRow[] {
  const unique = [...new Set(ids)];
  const rows = unique.map(
    (id) =>
      db
        .prepare("SELECT * FROM users WHERE id = ? AND company_id = ? AND role = 'worker' AND active = 1")
        .get(id, companyId) as UserRow | undefined,
  );
  if (rows.some((r) => !r)) throw badRequest('One of the selected workers was not found.');
  return rows as UserRow[];
}

export interface ShiftInput {
  workerIds: number[];
  siteId: number;
  dates: string[];
  start: string;
  end: string;
  note: string;
}

export function createShifts(db: DB, actor: Actor, company: CompanyRow, input: ShiftInput): ShiftRow[] {
  const tz = company.timezone;
  const site = getSite(db, company.id, input.siteId);
  if (!site.active) throw badRequest('This site is not active.');
  const workers = companyWorkers(db, company.id, input.workerIds);
  const dates = [...new Set(input.dates)].sort();
  if (workers.length * dates.length > 500) throw badRequest('Too many shifts at once (max 500).');

  const planned: Array<{ worker: UserRow; startsAt: string; endsAt: string }> = [];
  const clashes: string[] = [];
  for (const worker of workers) {
    for (const date of dates) {
      // Each date yields one shift shorter than 24 h, so shifts within one request never overlap each other.
      const { startsAt, endsAt } = shiftRange(date, input.start, input.end, tz);
      const clash = overlapping(db, worker.id, startsAt, endsAt);
      if (clash) {
        clashes.push(`${worker.full_name}: ${formatLocal(clash.starts_at, tz)}–${localTime(clash.ends_at, tz)}`);
        continue;
      }
      planned.push({ worker, startsAt, endsAt });
    }
  }
  if (clashes.length) {
    throw conflict('Some workers already have a shift at that time.', 'SHIFT_OVERLAP', { clashes: clashes.slice(0, 20) });
  }

  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO shifts (company_id, site_id, worker_id, starts_at, ends_at, note, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const created: ShiftRow[] = [];
  db.transaction(() => {
    for (const p of planned) {
      const id = Number(
        insert.run(company.id, site.id, p.worker.id, p.startsAt, p.endsAt, input.note, actor.id, now, now).lastInsertRowid,
      );
      created.push(db.prepare('SELECT * FROM shifts WHERE id = ?').get(id) as ShiftRow);
    }
    audit(db, actor, 'shift.create', {
      companyId: company.id,
      entity: 'shift',
      entityId: created.map((s) => s.id).join(','),
      summary: `Created ${created.length} shift${created.length === 1 ? '' : 's'} at ${site.name} (${input.start}–${input.end})`,
      details: { workerIds: workers.map((w) => w.id), dates, start: input.start, end: input.end },
    });
  })();
  return created;
}

export interface ShiftPatch {
  siteId?: number;
  workerId?: number;
  date?: string;
  start?: string;
  end?: string;
  note?: string;
}

export function updateShift(db: DB, actor: Actor, company: CompanyRow, id: number, patch: ShiftPatch): ShiftListRow {
  const tz = company.timezone;
  const before = getShiftRow(db, company.id, id);
  const siteId = patch.siteId ?? before.site_id;
  if (patch.siteId) getSite(db, company.id, patch.siteId);
  const workerId = patch.workerId ?? before.worker_id;
  if (patch.workerId) companyWorkers(db, company.id, [patch.workerId]);
  const range = shiftRange(
    patch.date ?? localDate(before.starts_at, tz),
    patch.start ?? localTime(before.starts_at, tz),
    patch.end ?? localTime(before.ends_at, tz),
    tz,
  );
  const clash = overlapping(db, workerId, range.startsAt, range.endsAt, id);
  if (clash) {
    throw conflict('This worker already has a shift at that time.', 'SHIFT_OVERLAP', {
      clashes: [`${formatLocal(clash.starts_at, tz)}–${localTime(clash.ends_at, tz)}`],
    });
  }
  db.prepare(
    'UPDATE shifts SET site_id = ?, worker_id = ?, starts_at = ?, ends_at = ?, note = ?, updated_at = ? WHERE id = ?',
  ).run(siteId, workerId, range.startsAt, range.endsAt, patch.note ?? before.note, nowIso(), id);
  const after = getShiftRow(db, company.id, id);
  audit(db, actor, 'shift.update', {
    companyId: company.id,
    entity: 'shift',
    entityId: id,
    summary: `Changed ${after.worker_name}'s shift to ${formatLocal(after.starts_at, tz)}–${localTime(after.ends_at, tz)} at ${after.site_name}`,
    details: {
      before: { siteId: before.site_id, workerId: before.worker_id, startsAt: before.starts_at, endsAt: before.ends_at, note: before.note },
      after: { siteId, workerId, startsAt: range.startsAt, endsAt: range.endsAt, note: after.note },
    },
  });
  return after;
}

export function deleteShift(db: DB, actor: Actor, company: CompanyRow, id: number): void {
  const row = getShiftRow(db, company.id, id);
  db.prepare('DELETE FROM shifts WHERE id = ?').run(id);
  audit(db, actor, 'shift.delete', {
    companyId: company.id,
    entity: 'shift',
    entityId: id,
    summary: `Deleted ${row.worker_name}'s shift ${formatLocal(row.starts_at, company.timezone)}–${localTime(row.ends_at, company.timezone)}`,
    details: { workerId: row.worker_id, siteId: row.site_id, startsAt: row.starts_at, endsAt: row.ends_at },
  });
}

/** Copies every shift of one week (Mon–Sun, local) onto another week, keeping wall-clock times. */
export function copyWeek(
  db: DB,
  actor: Actor,
  company: CompanyRow,
  fromWeekStart: string,
  toWeekStart: string,
): { created: number; skipped: number } {
  const tz = company.timezone;
  const delta = Math.round((Date.parse(toWeekStart) - Date.parse(fromWeekStart)) / 86_400_000);
  if (delta === 0) throw badRequest('Choose a different week to copy to.');
  const source = db
    .prepare(
      `SELECT sh.* FROM shifts sh JOIN users w ON w.id = sh.worker_id JOIN sites s ON s.id = sh.site_id
       WHERE sh.company_id = ? AND sh.starts_at >= ? AND sh.starts_at < ? AND w.active = 1 AND s.active = 1`,
    )
    .all(company.id, zonedToUtc(fromWeekStart, '00:00', tz), zonedToUtc(addDays(fromWeekStart, 7), '00:00', tz)) as ShiftRow[];

  let created = 0;
  let skipped = 0;
  const now = nowIso();
  const insert = db.prepare(
    `INSERT INTO shifts (company_id, site_id, worker_id, starts_at, ends_at, note, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const s of source) {
      const startsAt = zonedToUtc(addDays(localDate(s.starts_at, tz), delta), localTime(s.starts_at, tz), tz);
      const endsAt = zonedToUtc(addDays(localDate(s.ends_at, tz), delta), localTime(s.ends_at, tz), tz);
      if (endsAt <= startsAt || overlapping(db, s.worker_id, startsAt, endsAt)) {
        skipped++;
        continue;
      }
      insert.run(company.id, s.site_id, s.worker_id, startsAt, endsAt, s.note, actor.id, now, now);
      created++;
    }
    audit(db, actor, 'shift.copy_week', {
      companyId: company.id,
      entity: 'shift',
      summary: `Copied week of ${fromWeekStart} to week of ${toWeekStart}: ${created} created, ${skipped} skipped`,
      details: { fromWeekStart, toWeekStart, created, skipped },
    });
  })();
  return { created, skipped };
}
