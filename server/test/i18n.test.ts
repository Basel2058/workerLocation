import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLAG_INFO } from '../../shared/types';
import { dictionary, tr } from '../src/i18n';
import { JOBS } from '../src/jobs';
import { ENTRY_STATUS_LABELS } from '../src/services/timesheets';

/** Single-quoted string literals in a piece of code, except object keys (`{ 'reset-2fa': … }`). */
function literals(code: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (c === '`' || c === '"') {
      // Skip template and double-quoted strings whole.
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++;
      continue;
    }
    if (c !== "'") continue;
    let text = '';
    for (i++; i < code.length && code[i] !== "'"; i++) {
      if (code[i] === '\\') i++;
      text += code[i];
    }
    const before = code.slice(0, i - text.length - 1).trimEnd().slice(-1);
    const after = code.slice(i + 1).trimStart()[0];
    if (after === ':' && (before === '{' || before === ',')) continue;
    out.push(text);
  }
  return out;
}

/**
 * English texts the server shows to people: string literals passed to the message and error helpers and to
 * Zod rules, found by scanning the source. Every one must have an Arabic and a Hebrew translation.
 */
function serverMessages(): Map<string, string> {
  const found = new Map<string, string>();
  const calls = /\b(?:msg|tr|badRequest|conflict|forbidden|notFound|unauthorized|tooMany|AppError|min|max|regex|refine|rateLimit)\(/g;
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'i18n' ? [] : walk(p);
      return p.endsWith('.ts') ? [p] : [];
    });
  for (const file of walk(path.join(__dirname, '../src'))) {
    const src = fs.readFileSync(file, 'utf8');
    for (const call of src.matchAll(calls)) {
      // The call's arguments, up to the matching parenthesis.
      let depth = 1;
      let i = call.index! + call[0].length;
      const start = i;
      let quote: string | null = null;
      for (; i < src.length && depth > 0; i++) {
        const c = src[i]!;
        if (quote) {
          if (c === '\\') i++;
          else if (c === quote) quote = null;
        } else if (c === "'" || c === '`' || c === '"') quote = c;
        else if (c === '(') depth++;
        else if (c === ')') depth--;
      }
      for (const text of literals(src.slice(start, i - 1))) {
        // People-facing sentences or labels: a space or a capitalised word, not codes like 'NOT_IN' or 'time'.
        if (!/[a-z]/.test(text) || !(/\s/.test(text) || /^[A-Z][a-z]/.test(text))) continue;
        if (!found.has(text)) found.set(text, `${path.relative(process.cwd(), file)}:${src.slice(0, call.index).split('\n').length}`);
      }
    }
  }
  for (const job of JOBS) found.set(job.label, 'jobs.ts');
  for (const label of Object.values(ENTRY_STATUS_LABELS)) found.set(label, 'timesheets.ts');
  for (const info of Object.values(FLAG_INFO)) found.set(info.label, 'shared/types.ts FLAG_INFO');
  return found;
}

describe('server translations', () => {
  const messages = serverMessages();

  it('finds the server messages', () => {
    expect(messages.size).toBeGreaterThan(100);
    expect(messages.has('Wrong username or password.')).toBe(true);
  });

  for (const locale of ['ar', 'he'] as const) {
    it(`has a ${locale} translation for every message`, () => {
      const dict = dictionary(locale);
      const missing = [...messages].filter(([text]) => !(text in dict)).map(([text, where]) => `${where}  ${text}`);
      expect(missing).toEqual([]);
    });

    it(`keeps the placeholders in ${locale}`, () => {
      const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      const broken = Object.entries(dictionary(locale)).filter(([en, value]) => {
        const forms = typeof value === 'string' ? [value] : Object.entries(value).filter(([k]) => k !== '__plural').map(([, v]) => v as string);
        return forms.some((form) => placeholders(form).some((p) => !placeholders(en).includes(p)));
      });
      expect(broken.map(([en]) => en)).toEqual([]);
    });
  }

  it('has no translations that the code no longer uses', () => {
    const unused = Object.keys(dictionary('ar')).filter((text) => !messages.has(text) && text !== ', ');
    expect(unused).toEqual([]);
  });

  it('formats parameters for the reader', () => {
    expect(tr('You are {distance} from {site}. Go to your workplace and try again.', { distance: { meters: 3600 }, site: 'Yard' }, 'en')).toBe(
      'You are 3.6 km from Yard. Go to your workplace and try again.',
    );
    expect(tr('Too many wrong passwords. Try again in {count} minutes.', { count: 1 }, 'en')).toBe(
      'Too many wrong passwords. Try again in 1 minute.',
    );
    expect(tr('Your shift starts at {time}.', { time: { at: '2026-10-22T07:00:00Z', tz: 'Asia/Jerusalem', style: 'time' } }, 'he')).toContain('10:00');
  });
});
