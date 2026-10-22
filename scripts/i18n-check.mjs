// Lists text in .tsx/.ts files that looks like it was not translated (English shown to users).
// Usage: node scripts/i18n-check.mjs [dir-or-file ...]   (defaults to web/src)
// Heuristic: JSX text with letters, user-facing props and toast/error calls with a string literal.
import fs from 'node:fs';
import path from 'node:path';

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['web/src'];
const skipDirs = ['i18n'];
const files = [];
function walk(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    if (skipDirs.includes(path.basename(p))) return;
    for (const f of fs.readdirSync(p)) walk(path.join(p, f));
  } else if (/\.(tsx|ts)$/.test(p) && !p.endsWith('.d.ts')) files.push(p);
}
targets.forEach(walk);

const PROPS = 'label|title|placeholder|description|hint|aria-label|body|confirmText|cancelText|subtitle|alt|empty|caption|tooltip|submitLabel|text';
const patterns = [
  // >Some text<  (JSX text; ignores {expressions})
  { re: /(?<![=-])>\s*([^<>{}\n]*[A-Za-z]{2,}[^<>{}\n]*?)\s*</g, why: 'jsx text' },
  // label="Text" or label={'Text'} or label={`Text`}
  { re: new RegExp(`\\b(?:${PROPS})=(?:"([^"]*[A-Za-z]{2,}[^"]*)"|\\{['\`]([^'\`]*[A-Za-z]{2,}[^'\`]*)['\`]\\})`, 'g'), why: 'prop' },
  // toast.error('Text'), setError('Text'), new Error('Text'), confirm({ title: 'Text' ...
  { re: /\b(?:toast\.(?:success|error|info)|setError|setMessage|fail)\(\s*['`]([^'`]*[A-Za-z]{2,}[^'`]*)['`]/g, why: 'call' },
  { re: /\b(?:title|body|label|description|hint|message|text|confirmText|placeholder):\s*['`]([^'`]*[A-Za-z]{2,}[^'`]*)['`]/g, why: 'object' },
];
const allow = /^(OnSite|GPS|Wi-Fi|WhatsApp|CSV|iPhone|Android|Chrome|Leaflet|OpenStreetMap|UTC|ID|IP|OK|PNG|JPEG|px|ms|[A-Z_]+|[a-z]+(-[a-z]+)+|\W+)$/;
let total = 0;
for (const file of files) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*|import )/.test(line) || line.includes('i18n-ignore')) return;
    for (const { re, why } of patterns) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const text = (m[1] ?? m[2] ?? '').trim();
        if (!text || allow.test(text) || /^[\s\d:.,·–—()+%/-]*$/.test(text)) continue;
        if (/className|=>|\bconst\b|\bfunction\b|&&|\?\s|\|\|/.test(text)) continue;
        total++;
        console.log(`${file}:${i + 1}  [${why}]  ${text}`);
      }
    }
  });
}
console.log(total ? `\n${total} possible untranslated strings.` : 'No untranslated strings found.');
process.exitCode = total ? 1 : 0;
