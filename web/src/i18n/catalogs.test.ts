import { describe, expect, it } from 'vitest';
import { isPlural, type Catalog, type Plural } from '../../../shared/i18n';
import ar from './ar';
import en from './en';
import he from './he';

/** Every message of a catalog with its dotted key. */
function messages(catalog: Catalog, prefix = ''): Map<string, string | Plural> {
  const out = new Map<string, string | Plural>();
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string' || isPlural(value)) out.set(path, value);
    else for (const [k, v] of messages(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const forms = (m: string | Plural) => (typeof m === 'string' ? [m] : Object.entries(m).filter(([k]) => k !== '__plural').map(([, v]) => v as string));

// Texts that are the same in every language (brand and technical words, symbols).
const SAME_EVERYWHERE = /^(OnSite|GPS|Wi-Fi|WhatsApp|CSV|IP|UTC|Node\.js|99\+|—|[\s·•–:,{}±\w]*\{\w+\}[\s·•–:,{}]*|\W*)$/;

const english = messages(en as unknown as Catalog);

describe.each([
  ['ar', ar, ['one', 'two', 'few', 'many', 'other']],
  ['he', he, ['one', 'two', 'other']],
] as const)('%s catalog', (_locale, catalog, pluralForms) => {
  const translated = messages(catalog as unknown as Catalog);

  it('has exactly the English keys', () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('keeps every placeholder and adds none', () => {
    const problems: string[] = [];
    for (const [key, source] of english) {
      const target = translated.get(key);
      if (target === undefined) continue;
      const wanted = new Set(forms(source).flatMap((f) => [...placeholders(f)]));
      const other = typeof target === 'string' ? target : target.other;
      for (const p of placeholders(other)) if (!wanted.has(p)) problems.push(`${key}: unknown {${p}}`);
      for (const f of forms(target)) for (const p of placeholders(f)) if (!wanted.has(p)) problems.push(`${key}: unknown {${p}}`);
      // The main form names everything; one/two forms may spell the number out ("one worker").
      for (const p of wanted) if (p !== 'count' && !placeholders(other).has(p)) problems.push(`${key}: lost {${p}}`);
    }
    expect([...new Set(problems)]).toEqual([]);
  });

  it('gives plural messages all the forms the language needs', () => {
    const problems: string[] = [];
    for (const [key, source] of english) {
      const target = translated.get(key);
      if (!isPlural(source)) {
        if (isPlural(target)) problems.push(`${key}: plural, English is not`);
        continue;
      }
      if (!isPlural(target)) {
        problems.push(`${key}: not a plural`);
        continue;
      }
      for (const form of pluralForms) if (!(target as unknown as Record<string, string>)[form]) problems.push(`${key}: no "${form}" form`);
    }
    expect(problems).toEqual([]);
  });

  it('has no English left', () => {
    const leftovers = [...english]
      .filter(([key, source]) => typeof source === 'string' && translated.get(key) === source && /[A-Za-z]{3}/.test(source))
      .filter(([, source]) => !SAME_EVERYWHERE.test(source as string))
      .map(([key, source]) => `${key}: ${source as string}`);
    expect(leftovers).toEqual([]);
  });
});
