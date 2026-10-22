import { getIntlLocale, t } from './i18n';

// Formatting helpers. Times are always shown in the company's time zone (the workplace clock),
// in the app's language (which also decides the 12/24-hour style).

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string, opts: Intl.DateTimeFormatOptions, locale = getIntlLocale()): Intl.DateTimeFormat {
  const key = `${locale}|${tz}|${JSON.stringify(opts)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { timeZone: tz, ...opts });
    cache.set(key, f);
  }
  return f;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const locale = getIntlLocale();
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = numberFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    numberFormats.set(key, f);
  }
  return f;
}

export function fmtNumber(n: number, maxFractionDigits = 0): string {
  return nf({ maximumFractionDigits: maxFractionDigits }).format(n);
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

/** First day of the week containing `date`: 0 Sunday, 1 Monday (default), 6 Saturday — see the company setting. */
export function weekStartOf(date: string, startsOn: 0 | 1 | 6 = 1): string {
  const day = noon(date).getUTCDay();
  return addDays(date, -((day - startsOn + 7) % 7));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000);
}

/** "Mon 21 Oct" for a local date string. */
export function fmtDay(date: string, opts: { relative?: boolean; tz?: string } = {}): string {
  if (opts.relative && opts.tz) {
    const today = todayIn(opts.tz);
    if (date === today) return t('common.today');
    if (date === addDays(today, 1)) return t('common.tomorrow');
    if (date === addDays(today, -1)) return t('common.yesterday');
  }
  return dtf('UTC', { weekday: 'short', day: 'numeric', month: 'short' }).format(noon(date));
}

export function fmtWeekday(date: string, style: 'short' | 'long' = 'short'): string {
  return dtf('UTC', { weekday: style }).format(noon(date));
}

export function fmtDayMonth(date: string): string {
  return dtf('UTC', { day: 'numeric', month: 'short' }).format(noon(date));
}

/** "8h 30m" (or "8 س 30 د", "8 ש׳ 30 ד׳"). */
export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return t('format.duration.m', { m: r });
  return r === 0 ? t('format.duration.h', { h }) : t('format.duration.hm', { h, m: r });
}

export function fmtHours(minutes: number): string {
  return fmtNumber(minutes / 60, 1);
}

export function fmtDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters >= 1000) return nf({ style: 'unit', unit: 'kilometer', unitDisplay: 'short', maximumFractionDigits: 1 }).format(meters / 1000);
  return nf({ style: 'unit', unit: 'meter', unitDisplay: 'short', maximumFractionDigits: 0 }).format(Math.round(meters));
}

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();
function rtf(): Intl.RelativeTimeFormat {
  const locale = getIntlLocale();
  let f = relativeFormats.get(locale);
  if (!f) {
    f = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    relativeFormats.set(locale, f);
  }
  return f;
}

/** "5 min. ago", "yesterday", "3 days ago" in the app's language. */
export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return t('common.never');
  const diff = Math.round((now - Date.parse(iso)) / 1000);
  if (diff < 45) return t('format.justNow');
  if (diff < 3600) return rtf().format(-Math.max(1, Math.round(diff / 60)), 'minute');
  if (diff < 86_400) return rtf().format(-Math.round(diff / 3600), 'hour');
  return rtf().format(-Math.round(diff / 86_400), 'day');
}

export function fmtBytes(bytes: number): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte'] as const;
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return nf({ style: 'unit', unit: units[i], unitDisplay: 'short', maximumFractionDigits: i > 0 && v < 10 ? 1 : 0 }).format(v);
}

export function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86_400);
  if (d) return t('format.duration.dh', { d, h: Math.floor((sec % 86_400) / 3600) });
  return fmtDuration(Math.floor(sec / 60));
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

/** "Good morning, Aisha" by the workplace clock. */
export function greeting(tz: string, name: string): string {
  const hour = Number(dtf(tz, { hour: '2-digit', hourCycle: 'h23' }, 'en-GB').format(new Date()));
  if (hour >= 5 && hour < 12) return t('format.greeting.morning', { name });
  if (hour >= 12 && hour < 18) return t('format.greeting.afternoon', { name });
  return t('format.greeting.evening', { name });
}
