import { DateTime, IANAZone } from 'luxon';

export const nowIso = () => new Date().toISOString();

export function isValidTimezone(tz: string): boolean {
  return IANAZone.isValidZone(tz);
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

export function minutesBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000);
}

/** Normalizes any parseable timestamp to the canonical `toISOString()` form used in the database. */
export function canonicalIso(value: string): string | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Local calendar date ('YYYY-MM-DD') of an instant in a time zone. */
export function localDate(iso: string, tz: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz).toISODate()!;
}

export function todayLocal(tz: string, now = nowIso()): string {
  return localDate(now, tz);
}

/** UTC range [start, end) covering a local calendar day. */
export function dayRange(date: string, tz: string): { start: string; end: string } {
  const start = DateTime.fromISO(date, { zone: tz }).startOf('day');
  return { start: start.toUTC().toISO()!, end: start.plus({ days: 1 }).toUTC().toISO()! };
}

/** UTC range [start, end) covering local dates from..to (inclusive). */
export function dateSpanRange(from: string, to: string, tz: string): { start: string; end: string } {
  return { start: dayRange(from, tz).start, end: dayRange(to, tz).end };
}

/** Converts a local wall-clock date + 'HH:mm' in a zone to a UTC ISO instant. */
export function zonedToUtc(date: string, time: string, tz: string): string {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: tz });
  if (!dt.isValid) throw new Error(`Invalid local time ${date} ${time}`);
  return dt.toUTC().toISO()!;
}

/** Converts a local 'YYYY-MM-DDTHH:mm' (as from <input type="datetime-local">) in a zone to UTC ISO, or null. */
export function localDateTimeToUtc(value: string, tz: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const dt = DateTime.fromISO(value, { zone: tz });
  return dt.isValid ? dt.toUTC().toISO() : null;
}

/** Local 'HH:mm' of an instant. */
export function localTime(iso: string, tz: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz).toFormat('HH:mm');
}

/** Monday of the week containing the given local date. */
/** First day of the week containing `date`; `startsOn`: 0 Sunday, 1 Monday, 6 Saturday. */
export function weekStart(date: string, startsOn: 0 | 1 | 6 = 1): string {
  const d = DateTime.fromISO(date);
  return d.minus({ days: ((d.weekday % 7) - startsOn + 7) % 7 }).toISODate()!;
}

export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date).plus({ days }).toISODate()!;
}

export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && DateTime.fromISO(date).isValid;
}

export function isValidClock(time: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

/** Days between two local dates (to - from). */
export function daysBetween(from: string, to: string): number {
  return Math.round(DateTime.fromISO(to).diff(DateTime.fromISO(from), 'days').days);
}

/** Format an instant for humans in a zone, e.g. "Wed 22 Oct 08:02". Used in CSV exports and messages. */
export function formatLocal(iso: string, tz: string, fmt = 'ccc d LLL HH:mm'): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz).toFormat(fmt);
}
