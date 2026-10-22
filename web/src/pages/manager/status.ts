import type { LiveRow, LiveStatus } from '../../../../shared/types';
import type { Tone } from '../../components/ui';
import { fmtDuration, fmtTime } from '../../lib/format';

export const STATUS_META: Record<LiveStatus, { label: string; tone: Tone }> = {
  on_site: { label: 'On site', tone: 'green' },
  late: { label: 'Not arrived', tone: 'red' },
  absent: { label: 'Absent', tone: 'red' },
  upcoming: { label: 'Upcoming', tone: 'gray' },
  checked_out: { label: 'Checked out', tone: 'gray' },
  missing_checkout: { label: 'No check-out', tone: 'amber' },
};

/** Short badge text for a row, e.g. "Late 25m", "Starts 9:15". */
export function statusBadge(row: LiveRow, tz: string): { text: string; tone: Tone } {
  switch (row.status) {
    case 'late':
      return { text: `Late ${fmtDuration(row.lateMinutes ?? 0)}`, tone: 'red' };
    case 'upcoming':
      return { text: row.shift ? `Starts ${fmtTime(row.shift.startsAt, tz)}` : 'Upcoming', tone: 'gray' };
    default:
      return { text: STATUS_META[row.status].label, tone: STATUS_META[row.status].tone };
  }
}

/** One line of detail under the badge. */
export function statusDetail(row: LiveRow, tz: string): string {
  const e = row.entry;
  switch (row.status) {
    case 'on_site':
      return `Arrived ${fmtTime(e?.clockInAt, tz)}${row.lateMinutes ? ` · ${fmtDuration(row.lateMinutes)} late` : ''}`;
    case 'checked_out':
      return `${fmtTime(e?.clockInAt, tz)} – ${fmtTime(e?.clockOutAt, tz)}${row.leftEarlyMinutes ? ` · left ${fmtDuration(row.leftEarlyMinutes)} early` : ''}`;
    case 'missing_checkout':
      return `Arrived ${fmtTime(e?.clockInAt, tz)} · no check-out`;
    case 'late':
      return `Shift started ${fmtTime(row.shift?.startsAt, tz)}`;
    case 'absent':
      return 'Did not come';
    case 'upcoming':
      return row.shift ? `${fmtTime(row.shift.startsAt, tz)} – ${fmtTime(row.shift.endsAt, tz)}` : '';
  }
}

export function shiftLine(row: LiveRow, tz: string): string {
  if (!row.shift) return row.entry?.siteName ? `No shift · ${row.entry.siteName}` : 'No shift';
  return `${fmtTime(row.shift.startsAt, tz)} – ${fmtTime(row.shift.endsAt, tz)} · ${row.shift.siteName}`;
}
