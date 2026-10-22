// Renders the app icons in web/public/icons from the SVG mark (uses Playwright's Chromium).
//   npm run icons            (set CHROMIUM_PATH to use a specific Chromium binary)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const out = path.resolve('web/public/icons');
fs.mkdirSync(out, { recursive: true });

const mark = (bg = true) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2dd4bf"/><stop offset="1" stop-color="#0f766e"/></linearGradient></defs>
  ${bg ? '<rect width="32" height="32" rx="9" fill="url(#g)"/>' : ''}
  <path d="M16 6.4c-4.15 0-7.5 3.22-7.5 7.35 0 5.3 6.18 10.92 6.88 11.53a.94.94 0 0 0 1.24 0c.7-.61 6.88-6.23 6.88-11.53 0-4.13-3.35-7.35-7.5-7.35Z" fill="#fff"/>
  <path d="m12.85 13.85 2.2 2.2 4.05-4.2" fill="none" stroke="#0f766e" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

fs.writeFileSync(path.join(out, 'favicon.svg'), mark().trim() + '\n');

const pages = [
  // name, size, html body
  ['icon-192.png', 192, `<div style="width:192px;height:192px">${mark()}</div>`],
  ['icon-512.png', 512, `<div style="width:512px;height:512px">${mark()}</div>`],
  // Maskable: full-bleed background, mark inside the 80% safe zone.
  ['icon-maskable-512.png', 512, `<div style="width:512px;height:512px;background:linear-gradient(135deg,#2dd4bf,#0f766e);display:grid;place-items:center"><div style="width:430px;height:430px">${mark(false)}</div></div>`],
  ['apple-touch-icon.png', 180, `<div style="width:180px;height:180px;background:linear-gradient(135deg,#2dd4bf,#0f766e);display:grid;place-items:center"><div style="width:160px;height:160px">${mark(false)}</div></div>`],
  // Android notification badge: white silhouette on transparent.
  ['badge-72.png', 72, `<div style="width:72px;height:72px;display:grid;place-items:center"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64"><path d="M16 3.5c-5 0-9 3.9-9 8.85 0 6.4 7.45 13.15 8.3 13.9a1.1 1.1 0 0 0 1.4 0c.85-.75 8.3-7.5 8.3-13.9 0-4.95-4-8.85-9-8.85Z" fill="#fff"/></svg></div>`],
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [name, size, body] of pages) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${body.replace('<svg ', '<svg width="100%" height="100%" ')}</body></html>`);
  await page.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', name);
}
await browser.close();
