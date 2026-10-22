// Languages and the small message-formatting core shared by the server and the web app.

export const LOCALES = ['en', 'ar', 'he'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_INFO: Record<Locale, { name: string; dir: 'ltr' | 'rtl' }> = {
  en: { name: 'English', dir: 'ltr' },
  ar: { name: 'العربية', dir: 'rtl' },
  he: { name: 'עברית', dir: 'rtl' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Best supported language for a list of BCP 47 tags (browser languages or an Accept-Language header). */
export function pickLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const base = tag.trim().toLowerCase().split(/[-_;]/)[0];
    if (base === 'iw') return 'he';
    if (isLocale(base)) return base;
  }
  return null;
}

export function parseAcceptLanguage(header: string | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((part) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag, q: q ? Number(q.trim().slice(2)) || 0 : 1 };
    })
    .filter((x) => x.tag && x.q > 0)
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
  return pickLocale(tags);
}

/**
 * The tag used with Intl for dates and numbers. Arabic keeps Western digits (0-9): they are what phones,
 * phone numbers and payslips use across the region, and they match the rest of the app.
 */
export function intlTag(locale: Locale, englishVariant = 'en'): string {
  if (locale === 'ar') return 'ar-u-nu-latn';
  if (locale === 'he') return 'he';
  return englishVariant;
}

// --- Messages ------------------------------------------------------------------------------------

/** A message with plural forms, chosen with Intl.PluralRules (Arabic uses all six forms). */
export interface Plural {
  readonly __plural: true;
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

/** Marks plural forms in a catalog: `p({ one: '{count} day', other: '{count} days' })`. */
export function p(forms: Omit<Plural, '__plural'>): Plural {
  return { __plural: true, ...forms };
}

export function isPlural(value: unknown): value is Plural {
  return typeof value === 'object' && value !== null && (value as Plural).__plural === true;
}

export interface Catalog {
  [key: string]: string | Plural | Catalog;
}

/** A translation must have exactly the keys of the English catalog. */
export type Translation<T> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Translation<T[K]>;
};

type Join<K extends string, P> = P extends string ? `${K}.${P}` : never;

/** Every dotted key of a catalog, e.g. 'worker.home.checkIn'. */
export type MessageKey<T> = {
  [K in keyof T & string]: T[K] extends string | Plural ? K : Join<K, MessageKey<T[K]>>;
}[keyof T & string];

export type Params = Record<string, string | number | null | undefined>;

export function lookup(catalog: Catalog, key: string): string | Plural | undefined {
  let node: string | Plural | Catalog | undefined = catalog;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || isPlural(node)) return undefined;
    node = (node as Catalog)[part];
  }
  return typeof node === 'string' || isPlural(node) ? node : undefined;
}

const pluralRules = new Map<string, Intl.PluralRules>();

export function pluralForm(message: Plural, count: number, locale: Locale): string {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(intlTag(locale));
    pluralRules.set(locale, rules);
  }
  // An exact 0 may have its own wording ("No workers") even in languages without a zero category.
  if (count === 0 && message.zero !== undefined) return message.zero;
  return message[rules.select(count) as Exclude<keyof Plural, '__plural'>] ?? message.other;
}

/** Replaces {name} placeholders. Unknown placeholders are left as they are so mistakes stay visible. */
export function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? whole : String(value);
  });
}

/** Resolves a key in a catalog (falling back to another one) and fills in the parameters. */
export function formatMessage(
  locale: Locale,
  catalogs: { primary: Catalog | undefined; fallback: Catalog },
  key: string,
  params?: Params,
): string {
  const message = (catalogs.primary && lookup(catalogs.primary, key)) ?? lookup(catalogs.fallback, key);
  if (message === undefined) return key;
  if (isPlural(message)) {
    const count = Number(params?.count ?? 0);
    return interpolate(pluralForm(message, count, locale), params);
  }
  return interpolate(message, params);
}
