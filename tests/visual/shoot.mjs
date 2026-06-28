// Screenshot runner for visual iteration.
// Usage: node shoot.mjs [scenarioId ...]
// Captures each scenario at a few sizes/themes into the session shots folder.

import { chromium } from 'playwright';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.GRAPHEIN_SHOTS ?? join(ROOT, 'tests', 'visual', '__shots__');
const SKETCH = process.env.GRAPHEIN_SKETCH === '1' || process.env.GRAPHEIN_SKETCH === 'true';

mkdirSync(OUT, { recursive: true });

const ids = process.argv.slice(2);
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

const matrix = [
  { name: 'md', w: 580, h: 360, theme: 'light' },
  { name: 'lg', w: 860, h: 480, theme: 'light' },
  { name: 'wide', w: 980, h: 300, theme: 'light' },
  { name: 'sm', w: 360, h: 240, theme: 'light' },
  { name: 'dark', w: 580, h: 360, theme: 'dark' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
// Keep screenshots deterministic — never capture mid-entrance-animation.
await page.addInitScript(() => {
  window.__GRAPHEIN_DISABLE_ANIM = true;
});
let count = 0;
let failures = 0;
let scenarios = ids;
if (scenarios.length === 0) {
  await page.goto(`${BASE}/?shot=line-single&w=580&h=360&theme=light`, { waitUntil: 'load' });
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
}

for (const id of scenarios) {
  for (const m of matrix) {
    const url = `${BASE}/?shot=${id}&w=${m.w}&h=${m.h}&theme=${m.theme}${SKETCH ? '&sketch=1' : ''}`;
    await page.setViewportSize({ width: m.w + 40, height: m.h + 40 });
    await page.goto(url, { waitUntil: 'load' });
    try {
      await page.waitForSelector('[data-shot-ready="true"]', { timeout: 5000 });
    } catch {
      console.warn(`! ${id} ${m.name} did not signal ready`);
      failures++;
    }
    const host = await page.$('.shot-root > div');
    const file = join(OUT, `${id}__${m.name}${SKETCH ? '__sketch' : ''}.png`);
    if (host) await host.screenshot({ path: file });
    else await page.screenshot({ path: file });
    const size = statSync(file).size;
    if (size < 3_000) {
      console.warn(`! ${file} looks blank (${size} bytes)`);
      failures++;
    }
    count++;
    console.log(`✓ ${file}`);
  }
}

await browser.close();
console.log(`\nCaptured ${count} screenshots to ${OUT}`);
if (failures) {
  console.log(`FAIL: ${failures} problem(s) detected`);
  process.exit(1);
}
