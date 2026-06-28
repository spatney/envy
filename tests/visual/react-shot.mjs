// End-to-end browser smoke test for @graphein/react.
// Loads the gallery's React page and screenshots the wrapper-rendered charts.
// Usage: node react-shot.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.GRAPHEIN_SHOTS ?? join(ROOT, 'tests', 'visual', '__shots__');

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.addInitScript(() => {
  window.__GRAPHEIN_DISABLE_ANIM = true;
});
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.setViewportSize({ width: 1380, height: 800 });
await page.goto(`${BASE}/#/react`, { waitUntil: 'load' });

let ready = true;
try {
  await page.waitForFunction(() => document.querySelectorAll('[data-graphein-ready="true"]').length >= 3, null, { timeout: 12000 });
} catch {
  ready = false;
}

// Assert the wrapper actually produced Graphein surfaces (canvas + ready signal).
const surfaces = await page.$$eval('[data-graphein-ready="true"]', (els) => els.length);
const canvases = await page.$$eval('canvas', (els) => els.length);

const file = join(OUT, 'react-wrapper.png');
await page.screenshot({ path: file });

await browser.close();

console.log(`ready=${ready} grapheinSurfaces=${surfaces} canvases=${canvases}`);
if (errors.length) {
  console.log('PAGE ERRORS:\n' + errors.join('\n'));
}
console.log(`✓ ${file}`);
if ((!ready || surfaces < 3) && (canvases < 3 || errors.length)) {
  console.log('FAIL: expected 3 ready Graphein surfaces, or at least 3 canvases with zero console errors');
  process.exit(1);
}
console.log('PASS');
