import type { LiveRow, LiveStatus } from '../../../../shared/types';
import type { Tone } from '../../components/ui';
import { fmtDuration, fmtTime } from '../../lib/format';
import { t } from '../../lib/i18n';

export const STATUS_TONE: Record<LiveStatus, Tone> = {
  on_site: 'green',
  late: 'red',
  absent: 'red',
  upcoming: 'gray',
  checked_out: 'gray',
  missing_checkout: 'amber',
};

/** Short badge text for a row, e.g. "Late 25m", "Starts 9:15". */
export function statusBadge(row: LiveRow, tz: string): { text: string; tone: Tone } {
  const tone = STATUS_TONE[row.status];
  switch (row.status) {
    case 'late':
      return { text: t('manager.status.lateBy', { duration: fmtDuration(row.lateMinutes ?? 0) }), tone };
    case 'upcoming':
      return { text: row.shift ? t('manager.status.startsAt', { time: fmtTime(row.shift.startsAt, tz) }) : t('manager.status.upcoming'), tone };
    case 'on_site':
      return { text: t('manager.status.onSite'), tone };
    case 'absent':
      return { text: t('manager.status.absent'), tone };
    case 'checked_out':
      return { text: t('manager.status.checkedOut'), tone };
    case 'missing_checkout':
      return { text: t('manager.shared.noCheckOut'), tone };
  }
}

/** One line of detail under the badge. */
export function statusDetail(row: LiveRow, tz: string): string {
  const e = row.entry;
  switch (row.status) {
    case 'on_site':
      return row.lateMinutes
        ? t('manager.status.arrivedLate', { time: fmtTime(e?.clockInAt, tz), late: fmtDuration(row.lateMinutes) })
        : t('manager.status.arrived', { time: fmtTime(e?.clockInAt, tz) });
    case 'checked_out': {
      const range = t('common.range', { from: fmtTime(e?.clockInAt, tz), to: fmtTime(e?.clockOutAt, tz) });
      return row.leftEarlyMinutes ? t('manager.status.leftEarly', { range, duration: fmtDuration(row.leftEarlyMinutes) }) : range;
    }
    case 'missing_checkout':
      return t('manager.status.arrivedNoCheckout', { time: fmtTime(e?.clockInAt, tz) });
    case 'late':
      return t('manager.status.shiftStarted', { time: fmtTime(row.shift?.startsAt, tz) });
    case 'absent':
      return t('manager.status.didNotCome');
    case 'upcoming':
      return row.shift ? t('common.range', { from: fmtTime(row.shift.startsAt, tz), to: fmtTime(row.shift.endsAt, tz) }) : '';
  }
}

export function shiftLine(row: LiveRow, tz: string): string {
  if (!row.shift) return row.entry?.siteName ? t('manager.status.noShiftAt', { site: row.entry.siteName }) : t('manager.status.noShift');
  const time = t('common.range', { from: fmtTime(row.shift.startsAt, tz), to: fmtTime(row.shift.endsAt, tz) });
  return `${time}${t('common.separator')}${row.shift.siteName}`;
}
