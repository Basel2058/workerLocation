import { flagInfo, type LiveCounts, type LiveResponse, type LiveRow, type LiveStatus, type TimeEntry } from '../../../shared/types';
import type { DB } from '../db';
import type { CompanyRow } from '../db/rows';
import { addMinutes, dayRange, minutesBetween, nowIso, todayLocal } from '../lib/time';
import { companySettings, listSites, toSite } from './companies';
import { closeStaleEntries, ENTRY_SELECT, toTimeEntries, type EntryListRow } from './entries';
import { latestPresenceByWorker, type PresenceWithPosition } from './presence';
import { listShifts } from './shifts';

const STATUS_ORDER: Record<LiveStatus, number> = {
  late: 0,
  missing_checkout: 1,
  on_site: 2,
  upcoming: 3,
  absent: 4,
  checked_out: 5,
};

/** Today's attendance board: every scheduled shift plus anyone checked in without a shift. */
export function getLive(db: DB, company: CompanyRow, opts: { siteId?: number; now?: string } = {}): LiveResponse {
  const tz = company.timezone;
  const now = opts.now ?? nowIso();
  const date = todayLocal(tz, now);
  const day = dayRange(date, tz);
  const settings = companySettings(company);
  closeStaleEntries(db, now, { companyId: company.id });

  const sites = listSites(db, company.id, true).map(toSite);
  const shifts = listShifts(db, company.id, day.start, day.end, { siteId: opts.siteId });
  const entryRows = db
    .prepare(
      `${ENTRY_SELECT}
       WHERE e.company_id = ? AND e.status <> 'void'
         AND ((e.clock_in_at >= ? AND e.clock_in_at < ?) OR e.status = 'open' OR e.shift_id IN (
           SELECT id FROM shifts WHERE company_id = ? AND starts_at < ? AND ends_at > ?))
       ORDER BY e.clock_in_at`,
    )
    .all(company.id, day.start, day.end, company.id, day.end, day.start) as EntryListRow[];
  const entries = toTimeEntries(db, entryRows, settings.lateGraceMin).filter(
    (e) => !opts.siteId || e.siteId === opts.siteId || shifts.some((s) => s.id === e.shiftId),
  );
  const workers = new Map(
    (
      db.prepare("SELECT id, full_name, phone FROM users WHERE company_id = ? AND role = 'worker'").all(company.id) as Array<{
        id: number;
        full_name: string;
        phone: string;
      }>
    ).map((w) => [w.id, w]),
  );
  const presence = latestPresenceByWorker(db, company.id, day.start);

  // Attach entries to shifts: linked ones directly, unlinked ones when they overlap the shift.
  const byShift = new Map<number, TimeEntry[]>();
  const loose: TimeEntry[] = [];
  for (const e of entries) {
    let shiftId = e.shiftId && shifts.some((s) => s.id === e.shiftId) ? e.shiftId : null;
    if (!shiftId && !e.shiftId) {
      const match = shifts.find(
        (s) =>
          s.worker_id === e.workerId &&
          e.clockInAt < s.ends_at &&
          (e.clockOutAt ?? now) > addMinutes(s.starts_at, -settings.earlyCheckInMin),
      );
      shiftId = match?.id ?? null;
    }
    if (shiftId) byShift.set(shiftId, [...(byShift.get(shiftId) ?? []), e]);
    else if (!e.shiftId) loose.push(e);
  }

  const rows: LiveRow[] = [];
  const grace = settings.lateGraceMin;
  for (const shift of shifts) {
    const worker = workers.get(shift.worker_id);
    if (!worker) continue;
    const list = byShift.get(shift.id) ?? [];
    const open = list.find((e) => e.status === 'open');
    const incomplete = list.find((e) => e.status === 'incomplete');
    const first = list[0];
    const last = list[list.length - 1];
    let status: LiveStatus;
    let late: number | null = first ? first.lateMinutes : null;
    let leftEarly: number | null = null;
    let entry: TimeEntry | undefined;
    if (open) {
      status = 'on_site';
      entry = open;
    } else if (incomplete) {
      status = 'missing_checkout';
      entry = incomplete;
    } else if (last) {
      status = 'checked_out';
      entry = last;
      const early = last.clockOutAt ? minutesBetween(last.clockOutAt, shift.ends_at) : 0;
      leftEarly = early > grace ? early : null;
    } else if (now < addMinutes(shift.starts_at, grace)) {
      status = 'upcoming';
    } else if (now < shift.ends_at) {
      status = 'late';
      late = minutesBetween(shift.starts_at, now);
    } else {
      status = 'absent';
    }
    rows.push(
      buildRow(`shift-${shift.id}`, worker, status, late, leftEarly, entry, list, presence.get(worker.id) ?? null, {
        id: shift.id,
        startsAt: shift.starts_at,
        endsAt: shift.ends_at,
        siteId: shift.site_id,
        siteName: shift.site_name,
      }),
    );
  }

  // Check-ins without a shift: one row per worker, showing the latest entry.
  const looseByWorker = new Map<number, TimeEntry[]>();
  for (const e of loose) looseByWorker.set(e.workerId, [...(looseByWorker.get(e.workerId) ?? []), e]);
  for (const [workerId, list] of looseByWorker) {
    const worker = workers.get(workerId);
    if (!worker) continue;
    const entry = list.find((e) => e.status === 'open') ?? list.find((e) => e.status === 'incomplete') ?? list[list.length - 1]!;
    const status: LiveStatus =
      entry.status === 'open' ? 'on_site' : entry.status === 'incomplete' ? 'missing_checkout' : 'checked_out';
    rows.push(buildRow(`entry-${entry.id}`, worker, status, null, null, entry, list, presence.get(workerId) ?? null, null));
  }

  rows.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      Number(b.needsReview) - Number(a.needsReview) ||
      (a.shift?.startsAt ?? a.entry?.clockInAt ?? '').localeCompare(b.shift?.startsAt ?? b.entry?.clockInAt ?? '') ||
      a.worker.name.localeCompare(b.worker.name),
  );

  const counts: LiveCounts = {
    total: rows.length,
    onSite: rows.filter((r) => r.status === 'on_site').length,
    late: rows.filter((r) => r.status === 'late').length,
    absent: rows.filter((r) => r.status === 'absent').length,
    checkedOut: rows.filter((r) => r.status === 'checked_out').length,
    upcoming: rows.filter((r) => r.status === 'upcoming').length,
    missingCheckout: rows.filter((r) => r.status === 'missing_checkout').length,
    lateArrivals: rows.filter((r) => r.lateMinutes !== null && r.status !== 'late').length,
    review: rows.filter((r) => r.needsReview).length,
  };
  return { now, date, timezone: tz, sites, rows, counts };
}

function buildRow(
  key: string,
  worker: { id: number; full_name: string; phone: string },
  status: LiveStatus,
  lateMinutes: number | null,
  leftEarlyMinutes: number | null,
  entry: TimeEntry | undefined,
  list: TimeEntry[],
  presence: PresenceWithPosition | null,
  shift: LiveRow['shift'],
): LiveRow {
  const punch = entry ? (entry.outPunch ?? entry.inPunch) : null;
  let location: LiveRow['location'] =
    punch && punch.lat !== null && punch.lng !== null
      ? { lat: punch.lat, lng: punch.lng, accuracy: punch.accuracy, at: punch.at, kind: punch.type }
      : null;
  const answered = presence?.check.respondedAt;
  if (presence && answered && presence.lat !== null && presence.lng !== null && (!location || answered > location.at)) {
    location = { lat: presence.lat, lng: presence.lng, accuracy: presence.accuracy, at: answered, kind: 'check' };
  }
  const flags = new Set<string>();
  for (const e of list) for (const f of e.flags) if (flagInfo(f).severity !== 'info') flags.add(f);
  return {
    key,
    worker: { id: worker.id, name: worker.full_name, phone: worker.phone },
    shift,
    status,
    lateMinutes,
    leftEarlyMinutes,
    entry: entry
      ? { id: entry.id, clockInAt: entry.clockInAt, clockOutAt: entry.clockOutAt, siteName: entry.siteName, status: entry.status }
      : null,
    location,
    needsReview: list.some((e) => e.needsReview),
    flags: [...flags],
    selfieId: punch?.selfieId ?? null,
    presence: presence?.check ?? null,
  };
}
