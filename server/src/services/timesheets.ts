import type { TimeEntry, TimesheetResponse, TimesheetRow } from '../../../shared/types';
import { flagInfo } from '../../../shared/types';
import type { DB } from '../db';
import type { CompanyRow } from '../db/rows';
import { tr } from '../i18n';
import { dateSpanRange, formatLocal, localDate, minutesBetween, nowIso } from '../lib/time';
import { companySettings } from './companies';
import { listEntries } from './entries';
import { listShifts, shiftForEntry, type ShiftListRow } from './shifts';

/** Links entries to shifts by id, or by overlapping time for entries recorded without a shift. */
function entriesPerShift(shifts: ShiftListRow[], entries: TimeEntry[], earlyMin: number, now: string) {
  const map = new Map<number, TimeEntry[]>();
  for (const e of entries) {
    const shiftId = e.shiftId ?? shiftForEntry(shifts, e, earlyMin, now)?.id ?? null;
    if (shiftId) map.set(shiftId, [...(map.get(shiftId) ?? []), e]);
  }
  for (const list of map.values()) list.sort((a, b) => a.clockInAt.localeCompare(b.clockInAt));
  return map;
}

export interface TimesheetData {
  response: TimesheetResponse;
  entries: TimeEntry[];
}

export function getTimesheet(db: DB, company: CompanyRow, from: string, to: string): TimesheetData {
  const tz = company.timezone;
  const settings = companySettings(company);
  const range = dateSpanRange(from, to, tz);
  const now = nowIso();
  const shifts = listShifts(db, company.id, range.start, range.end).filter((s) => s.starts_at >= range.start);
  const entries = listEntries(db, company, { start: range.start, end: range.end });
  const perShift = entriesPerShift(shifts, entries, settings.earlyCheckInMin, now);

  const workerRows = db
    .prepare(
      `SELECT id, full_name, employee_code, active FROM users WHERE company_id = ? AND role = 'worker'
       ORDER BY full_name COLLATE NOCASE`,
    )
    .all(company.id) as Array<{ id: number; full_name: string; employee_code: string; active: number }>;

  const rows: TimesheetRow[] = [];
  for (const w of workerRows) {
    const myShifts = shifts.filter((s) => s.worker_id === w.id);
    const myEntries = entries.filter((e) => e.workerId === w.id);
    if (!w.active && myShifts.length === 0 && myEntries.length === 0) continue;
    let lateCount = 0;
    let lateMinutes = 0;
    let absentCount = 0;
    for (const s of myShifts) {
      const linked = perShift.get(s.id) ?? [];
      if (linked.length === 0) {
        if (s.ends_at <= now) absentCount++;
        continue;
      }
      const late = minutesBetween(s.starts_at, linked[0]!.clockInAt);
      if (late > settings.lateGraceMin) {
        lateCount++;
        lateMinutes += late;
      }
    }
    rows.push({
      worker: { id: w.id, name: w.full_name, employeeCode: w.employee_code },
      scheduledMinutes: myShifts.reduce((sum, s) => sum + minutesBetween(s.starts_at, s.ends_at), 0),
      workedMinutes: myEntries.reduce((sum, e) => sum + (e.minutes ?? 0), 0),
      daysWorked: new Set(myEntries.map((e) => localDate(e.clockInAt, tz))).size,
      shifts: myShifts.length,
      lateCount,
      lateMinutes,
      absentCount,
      openIssues: myEntries.filter((e) => e.status === 'incomplete' || e.needsReview).length,
    });
  }
  return {
    response: {
      from,
      to,
      timezone: tz,
      rows,
      totals: {
        scheduledMinutes: rows.reduce((s, r) => s + r.scheduledMinutes, 0),
        workedMinutes: rows.reduce((s, r) => s + r.workedMinutes, 0),
        lateCount: rows.reduce((s, r) => s + r.lateCount, 0),
        absentCount: rows.reduce((s, r) => s + r.absentCount, 0),
      },
    },
    entries,
  };
}

/** CSV cell: quoted when needed and protected against spreadsheet formula injection. */
function cell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const toCsv = (rows: Array<Array<string | number | null>>) =>
  // The BOM makes Excel open UTF-8 (e.g. Arabic names) correctly.
  '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';

const hours = (minutes: number) => (minutes / 60).toFixed(2);

export const ENTRY_STATUS_LABELS: Record<TimeEntry['status'], string> = {
  open: 'Checked in',
  closed: 'Complete',
  incomplete: 'Missing check-out',
  void: 'Removed',
};

// Column names and values are in the reader's language; numbers and dates stay machine-readable.
export function timesheetSummaryCsv(data: TimesheetData): string {
  return toCsv([
    [
      tr('Worker'),
      tr('Employee code'),
      tr('Scheduled hours'),
      tr('Worked hours'),
      tr('Days worked'),
      tr('Shifts'),
      tr('Late arrivals'),
      tr('Late minutes'),
      tr('Absences'),
      tr('Open issues'),
    ],
    ...data.response.rows.map((r) => [
      r.worker.name,
      r.worker.employeeCode,
      hours(r.scheduledMinutes),
      hours(r.workedMinutes),
      r.daysWorked,
      r.shifts,
      r.lateCount,
      r.lateMinutes,
      r.absentCount,
      r.openIssues,
    ]),
  ]);
}

export function timesheetEntriesCsv(data: TimesheetData, tz: string): string {
  const fmt = (iso: string | null) => (iso ? formatLocal(iso, tz, 'yyyy-MM-dd HH:mm') : '');
  const entries = [...data.entries].sort(
    (a, b) => a.workerName.localeCompare(b.workerName) || a.clockInAt.localeCompare(b.clockInAt),
  );
  return toCsv([
    [
      tr('Date'),
      tr('Worker'),
      tr('Workplace'),
      tr('Shift start'),
      tr('Shift end'),
      tr('Check-in'),
      tr('Check-out'),
      tr('Hours'),
      tr('Late minutes'),
      tr('Status'),
      tr('Source'),
      tr('Flags'),
      tr('Note'),
      tr('Edited by'),
    ],
    ...entries.map((e) => [
      localDate(e.clockInAt, tz),
      e.workerName,
      e.siteName ?? '',
      fmt(e.shiftStartsAt),
      fmt(e.shiftEndsAt),
      fmt(e.clockInAt),
      fmt(e.clockOutAt),
      e.minutes === null ? '' : hours(e.minutes),
      e.lateMinutes ?? '',
      e.needsReview ? tr('Needs review') : tr(ENTRY_STATUS_LABELS[e.status]),
      tr(e.source === 'manual' ? 'Added by a manager' : 'App'),
      e.flags.map((f) => tr(flagInfo(f).label)).join('; '),
      e.note,
      e.editedByName ?? '',
    ]),
  ]);
}
