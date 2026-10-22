// Formatting helpers. Times are always shown in the company's time zone (the workplace clock),
// using the reader's locale for 12/24-hour style.

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, opts: Intl.DateTimeFormatOptions, locale?: string): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${tz}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts });
    cache.set(key, f);
  }
  return f;
}

export function fmtTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  return dtf(tz, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** Compact time for dense views: "7a", "3:30p" (12-hour locales) or "07:00" (24-hour locales). */
export function fmtTimeCompact(iso: string, tz: string): string {
  const parts = dtf(tz, { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const period = get('dayPeriod');
  if (!period) return `${get('hour')}:${get('minute')}`;
  const minute = get('minute');
  return `${get('hour')}${minute === '00' ? '' : `:${minute}`}${period.trim()[0]!.toLowerCase()}`;
}

export function fmtDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return '—';
  return dtf(tz, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function fmtFullDate(iso: string, tz: string): string {
  return dtf(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso));
}

/** 'YYYY-MM-DD' of an instant in a zone. */
export function localDateOf(iso: string | Date, tz: string): string {
  return dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-CA').format(new Date(iso));
}

export function todayIn(tz: string): string {
  return localDateOf(new Date(), tz);
}

/** Noon UTC of a local date, safe for weekday/day arithmetic without zone surprises. */
const noon = (date: string) => new Date(`${date}T12:00:00Z`);

export function addDays(date: string, days: number): string {
  const d = noon(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function weekStartOf(date: string): string {
  const day = noon(date).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000);
}

/** "Mon 21 Oct" for a local date string. */
export function fmtDay(date: string, opts: { relative?: boolean; tz?: string } = {}): string {
  if (opts.relative && opts.tz) {
    const today = todayIn(opts.tz);
    if (date === today) return 'Today';
    if (date === addDays(today, 1)) return 'Tomorrow';
    if (date === addDays(today, -1)) return 'Yesterday';
  }
  return dtf('UTC', { weekday: 'short', day: 'numeric', month: 'short' }).format(noon(date));
}

export function fmtWeekday(date: string, style: 'short' | 'long' = 'short'): string {
  return dtf('UTC', { weekday: style }).format(noon(date));
}

export function fmtDayMonth(date: string): string {
  return dtf('UTC', { day: 'numeric', month: 'short' }).format(noon(date));
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export function fmtHours(minutes: number): string {
  return (minutes / 60).toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export function fmtDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters >= 1000) return `${(meters / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;
  return `${Math.round(meters)} m`;
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.round((now - Date.parse(iso)) / 1000);
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.round(diff / 3600)} h ago`;
  const days = Math.round(diff / 86_400);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

const digits = (phone: string) => phone.replace(/[^\d+]/g, '');
export const telHref = (phone: string) => `tel:${digits(phone)}`;
export const smsHref = (phone: string) => `sms:${digits(phone)}`;
export const whatsappHref = (phone: string) => `https://wa.me/${digits(phone).replace(/^\+/, '').replace(/^00/, '')}`;

/** 'YYYY-MM-DDTHH:mm' in the zone, for <input type="datetime-local">. */
export function toLocalInput(iso: string, tz: string): string {
  const parts = dtf(tz, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'en-CA')
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** 'HH:mm' (24h) in the zone, for <input type="time">. */
export function toClockInput(iso: string, tz: string): string {
  return toLocalInput(iso, tz).slice(11, 16);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]![0] ?? '') : '';
  return (first + last).toUpperCase();
}

export function greeting(tz: string): string {
  const hour = Number(dtf(tz, { hour: '2-digit', hourCycle: 'h23' }, 'en-GB').format(new Date()));
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
