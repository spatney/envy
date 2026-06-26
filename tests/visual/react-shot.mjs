// End-to-end browser smoke test for @envy/react.
// Loads the gallery's React page and screenshots the wrapper-rendered charts.
// Usage: node react-shot.mjs

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ENVY_GALLERY ?? 'http://127.0.0.1:4317';
const OUT =
  process.env.ENVY_SHOTS ??
  'C:/Users/sapatney/.copilot/session-state/50c7b4d8-37fe-4e29-abd7-0188f62da234/files/shots';

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.addInitScript(() => {
  window.__ENVY_DISABLE_ANIM = true;
});
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(String(e)));

await page.setViewportSize({ width: 1380, height: 800 });
await page.goto(`${BASE}/react.html`, { waitUntil: 'load' });

let ready = true;
try {
  await page.waitForSelector('[data-shot-ready="true"]', { timeout: 8000 });
} catch {
  ready = false;
}

// Assert the wrapper actually produced Envy surfaces (canvas + ready signal).
const surfaces = await page.$$eval('[data-envy-ready="true"]', (els) => els.length);
const canvases = await page.$$eval('canvas', (els) => els.length);

const file = `${OUT}/react-wrapper.png`;
await page.screenshot({ path: file });

await browser.close();

console.log(`ready=${ready} envySurfaces=${surfaces} canvases=${canvases}`);
if (errors.length) {
  console.log('PAGE ERRORS:\n' + errors.join('\n'));
}
console.log(`✓ ${file}`);
if (!ready || surfaces < 3) {
  console.log('FAIL: expected 3 ready Envy surfaces');
  process.exit(1);
}
console.log('PASS');
