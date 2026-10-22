import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  formatMessage,
  intlTag,
  isLocale,
  isPlural,
  LOCALE_INFO,
  lookup,
  pickLocale,
  pluralForm,
  type Catalog,
  type Locale,
  type MessageKey,
  type Params,
} from '../../../shared/i18n';
import en, { type Messages } from '../i18n/en';

export type { Locale } from '../../../shared/i18n';
export type MsgKey = MessageKey<Messages>;

// Arabic and Hebrew are loaded on demand so English-only phones do not download them.
const loaders: Record<Exclude<Locale, 'en'>, () => Promise<{ default: unknown }>> = {
  ar: () => import('../i18n/ar'),
  he: () => import('../i18n/he'),
};
const catalogs: Partial<Record<Locale, Catalog>> = { en: en as unknown as Catalog };
const STORAGE_KEY = 'onsite.lang';

let current: Locale = 'en';

/** The language the app is shown in right now. */
export function getLocale(): Locale {
  return current;
}

/** The Intl tag for dates and numbers, keeping the reader's English variant (en-GB, en-US…). */
export function getIntlLocale(locale: Locale = current): string {
  const english = typeof navigator === 'undefined' ? undefined : navigator.languages?.find((l) => /^en(-|$)/i.test(l));
  return intlTag(locale, english ?? 'en');
}

export async function loadLocale(locale: Locale): Promise<void> {
  if (catalogs[locale]) return;
  const mod = await loaders[locale as Exclude<Locale, 'en'>]();
  catalogs[locale] = mod.default as Catalog;
}

/** The saved choice on this device, else the phone's language, else English. */
export function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage blocked (private mode): fall back to the phone's language.
  }
  return pickLocale(navigator.languages?.length ? navigator.languages : [navigator.language]) ?? 'en';
}

/** Makes `locale` the active language: catalog must be loaded first (see loadLocale). */
export function applyLocale(locale: Locale): void {
  current = locale;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = LOCALE_INFO[locale].dir;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Not saved; the phone language is used next time.
  }
}

/**
 * Wraps text in invisible Unicode isolation marks so it keeps its own direction inside a sentence of the other
 * direction: "Main St." stays "Main St." in a Hebrew line instead of turning into ".Main St".
 */
export function isolate(text: string): string {
  return `\u2068${text}\u2069`;
}

/** A message in a given language (its catalog must be loaded). */
export function translate(locale: Locale, key: MsgKey, params?: Params): string {
  // In right-to-left languages, names and other inserted text are isolated (see isolate()).
  const values =
    params && LOCALE_INFO[locale].dir === 'rtl'
      ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'string' && v ? isolate(v) : v]))
      : params;
  return formatMessage(locale, { primary: catalogs[locale], fallback: catalogs.en! }, key, values);
}

/**
 * A message in the current language. Call it while rendering or in event handlers, never at module
 * level: the language can change while the app runs.
 */
export function t(key: MsgKey, params?: Params): string {
  return translate(current, key, params);
}

/**
 * A message with React elements in its placeholders, e.g.
 * `tRich('dev.people.typeName', { name: <b>{user.name}</b> })`.
 */
export function tRich(key: MsgKey, params: Record<string, ReactNode>): ReactNode {
  const message = lookup(catalogs[current] ?? catalogs.en!, key) ?? lookup(catalogs.en!, key) ?? key;
  const template = isPlural(message) ? pluralForm(message, Number(params.count ?? 0), current) : message;
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const name = /^\{(\w+)\}$/.exec(part)?.[1];
    return name !== undefined && name in params ? <Fragment key={i}>{params[name]}</Fragment> : part;
  });
}

interface I18nValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale(locale: Locale): Promise<void>;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * Holds the language. Changing it re-renders the whole app below the provider (`remount`) so every
 * text and formatted date picks up the new language at once.
 */
export function I18nProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, setState] = useState(initial);
  const setLocale = useCallback(async (next: Locale) => {
    await loadLocale(next);
    applyLocale(next);
    setState(next);
  }, []);
  const value = useMemo<I18nValue>(() => ({ locale, dir: LOCALE_INFO[locale].dir, setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}

/**
 * Loads another language's messages (e.g. to write a login message in the new worker's language) and
 * returns that language once ready, the current one until then. Use with translate(locale, …).
 */
export function useLoadedLocale(locale: Locale): Locale {
  const [ready, setReady] = useState<Locale | null>(catalogs[locale] ? locale : null);
  useEffect(() => {
    let alive = true;
    if (catalogs[locale]) setReady(locale);
    else void loadLocale(locale).then(() => alive && setReady(locale), () => undefined);
    return () => {
      alive = false;
    };
  }, [locale]);
  return ready === locale ? locale : current;
}

/** Re-mounts its children when the language changes. */
export function LocaleBoundary({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return <Fragment key={locale}>{children}</Fragment>;
}
