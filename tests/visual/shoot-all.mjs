// Capture all gallery scenarios for visual review.
// Usage: node shoot-all.mjs [light|dark|both] [size]
import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.GRAPHEIN_SHOTS ?? join(ROOT, 'tests', 'visual', '__shots__');
mkdirSync(OUT, { recursive: true });

const themeArg = (process.argv[2] ?? 'both').toLowerCase();
const sizeArg = (process.argv[3] ?? 'lg').toLowerCase();
const SIZES = {
  sm: { w: 360, h: 240 },
  md: { w: 580, h: 360 },
  lg: { w: 820, h: 460 },
  wide: { w: 980, h: 300 },
  tall: { w: 440, h: 560 },
};
const size = SIZES[sizeArg] ?? SIZES.lg;
const themes = themeArg === 'both' ? ['light', 'dark'] : [themeArg];

const FALLBACK = [
  'line-single',
  'area-stacked-demand',
  'bar-quarter-region',
  'scatter-bubbles',
  'pie-browser-share',
  'heatmap-traffic-week-hour',
  'kpi-arr',
  'table-order-health',
  'matrix-revenue-pivot',
  'dashboard-cockpit',
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.addInitScript(() => { window.__GRAPHEIN_DISABLE_ANIM = true; });
let count = 0;
let failures = 0;
let scenarios = [];
await page.goto(`${BASE}/?shot=line-single&w=${size.w}&h=${size.h}&theme=light`, { waitUntil: 'load' });
try {
  await page.waitForSelector('[data-shot-ready="true"]', { timeout: 8000 });
  scenarios = await page.evaluate(() => window.__grapheinShotIds ?? []);
} catch {
  scenarios = [];
}
if (scenarios.length === 0) {
  console.warn('! Could not enumerate shot ids dynamically; using curated fallback');
  scenarios = FALLBACK;
}
for (const theme of themes) {
  for (const id of scenarios) {
    const url = `${BASE}/?shot=${id}&w=${size.w}&h=${size.h}&theme=${theme}`;
    await page.setViewportSize({ width: size.w + 40, height: size.h + 40 });
    await page.goto(url, { waitUntil: 'load' });
    try { await page.waitForSelector('[data-shot-ready="true"]', { timeout: 5000 }); }
    catch { console.warn(`! ${id} ${theme} did not signal ready`); failures++; }
    const host = await page.$('.shot-root > div');
    const file = join(OUT, `${id}__${theme}.png`);
    if (host) await host.screenshot({ path: file }); else await page.screenshot({ path: file });
    const bytes = statSync(file).size;
    if (bytes < 3_000) {
      console.warn(`! ${file} looks blank (${bytes} bytes)`);
      failures++;
    }
    count++;
    console.log(`OK ${file}`);
  }
}
await browser.close();
console.log(`\nCaptured ${count} screenshots to ${OUT}`);
if (failures) {
  console.log(`FAIL: ${failures} problem(s) detected`);
  process.exit(1);
}
