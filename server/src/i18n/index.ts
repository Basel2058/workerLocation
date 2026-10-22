import { AsyncLocalStorage } from 'node:async_hooks';
import { interpolate, intlTag, isPlural, pluralForm, type Locale, type Plural } from '../../../shared/i18n';
import ar from './ar';
import en from './en';
import he from './he';

// Server texts (errors, check-in results, alerts, change history, notifications, CSV headers) are written in
// English in the code; the English text is the key into the Arabic and Hebrew dictionaries. Texts that are
// stored and shown later keep their key and parameters, so every reader sees them in their own language.

export type Dict = Record<string, string | Plural>;
const dicts: Record<Locale, Dict> = { en, ar, he };

/** A date/time shown in the company's time zone, formatted for the reader's language. */
export interface TimeParam {
  at: string;
  tz: string;
  style?: 'datetime' | 'time' | 'date';
}
/** A distance in meters: "350 m", "3.6 km", "3.6 كم". */
export interface DistanceParam {
  meters: number;
}
export type MsgParam = string | number | null | undefined | TimeParam | DistanceParam | { msg: Msg };
export type MsgParams = Record<string, MsgParam>;

/** An English message with its parameters, translated when it is shown. */
export interface Msg {
  text: string;
  params?: MsgParams;
}

export function msg(text: string, params?: MsgParams): Msg {
  return params ? { text, params } : { text };
}

// --- Request language -----------------------------------------------------------------------------

interface LocaleStore {
  locale: Locale;
  /** The app said which language it shows (x-lang header); the account setting must not override it. */
  explicit: boolean;
}
const als = new AsyncLocalStorage<LocaleStore>();

/** Runs a request (or anything else) with a language; tr() uses it by default. */
export function runWithLocale<T>(locale: Locale, explicit: boolean, fn: () => T): T {
  return als.run({ locale, explicit }, fn);
}

export function requestLocale(): Locale {
  return als.getStore()?.locale ?? 'en';
}

/** Once the signed-in user is known: use their language unless the app already told us one. */
export function preferAccountLocale(locale: Locale | null | undefined): void {
  const store = als.getStore();
  if (store && !store.explicit && locale) store.locale = locale;
}

// --- Translating -----------------------------------------------------------------------------------

const dateStyles: Record<NonNullable<TimeParam['style']>, Intl.DateTimeFormatOptions> = {
  datetime: { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
  time: { hour: 'numeric', minute: '2-digit' },
  date: { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' },
};
const formats = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();
function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat>(key: string, make: () => T): T {
  let f = formats.get(key);
  if (!f) {
    f = make();
    formats.set(key, f);
  }
  return f as T;
}

function formatParam(value: MsgParam, locale: Locale): string | number | null | undefined {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  const tag = intlTag(locale);
  if ('msg' in value) return tr(value.msg.text, value.msg.params, locale);
  if ('meters' in value) {
    const km = value.meters >= 1000;
    const unit = km ? 'kilometer' : 'meter';
    return cached(
      `n|${tag}|${unit}`,
      () => new Intl.NumberFormat(tag, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: km ? 1 : 0 }),
    ).format(km ? value.meters / 1000 : Math.round(value.meters));
  }
  const style = value.style ?? 'datetime';
  return cached(`d|${tag}|${value.tz}|${style}`, () => new Intl.DateTimeFormat(tag, { timeZone: value.tz, ...dateStyles[style] })).format(
    new Date(value.at),
  );
}

/** Translates an English message into `locale` (default: the request's language) and fills in parameters. */
export function tr(text: string, params?: MsgParams, locale: Locale = requestLocale()): string {
  const entry = dicts[locale][text] ?? dicts.en[text] ?? text;
  const values: Record<string, string | number | null | undefined> = {};
  for (const [k, v] of Object.entries(params ?? {})) values[k] = formatParam(v, locale);
  const template = isPlural(entry) ? pluralForm(entry, Number(values.count ?? 0), locale) : entry;
  return interpolate(template, values);
}

export function trMsg(m: Msg, locale: Locale = requestLocale()): string {
  return tr(m.text, m.params, locale);
}

// --- Stored messages -------------------------------------------------------------------------------

/** For a message column: the English text, plus the key and parameters to translate it later. */
export function storeMsg(m: Msg | string): { english: string; i18n: string | null } {
  if (typeof m === 'string') return { english: m, i18n: null };
  return { english: trMsg(m, 'en'), i18n: JSON.stringify(m) };
}

/** A stored message in the reader's language (falls back to the stored English). */
export function renderStored(english: string, i18n: string | null | undefined, locale: Locale = requestLocale()): string {
  if (!i18n || locale === 'en') return english;
  try {
    return trMsg(JSON.parse(i18n) as Msg, locale);
  } catch {
    return english;
  }
}

/** Every key of a dictionary (used by the tests to find missing translations). */
export function dictionary(locale: Locale): Dict {
  return dicts[locale];
}
