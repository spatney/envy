// Screenshot runner for visual iteration.
// Usage: node shoot.mjs [scenarioId ...]
// Captures each scenario at a few sizes/themes into the session shots folder.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
const OUT =
  process.env.GRAPHEIN_SHOTS ??
  'C:/Users/sapatney/.copilot/session-state/50c7b4d8-37fe-4e29-abd7-0188f62da234/files/shots';
const SKETCH = process.env.GRAPHEIN_SKETCH === '1' || process.env.GRAPHEIN_SKETCH === 'true';

mkdirSync(OUT, { recursive: true });

const ids = process.argv.slice(2);
const scenarios =
  ids.length > 0
    ? ids
    : ['line-single', 'line-multi', 'line-smooth', 'area-single', 'area-stacked'];

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

for (const id of scenarios) {
  for (const m of matrix) {
    const url = `${BASE}/?shot=${id}&w=${m.w}&h=${m.h}&theme=${m.theme}${SKETCH ? '&sketch=1' : ''}`;
    await page.setViewportSize({ width: m.w + 40, height: m.h + 40 });
    await page.goto(url, { waitUntil: 'load' });
    try {
      await page.waitForSelector('[data-shot-ready="true"]', { timeout: 5000 });
    } catch {
      console.warn(`! ${id} ${m.name} did not signal ready`);
    }
    const host = await page.$('.shot-root > div');
    const file = `${OUT}/${id}__${m.name}${SKETCH ? '__sketch' : ''}.png`;
    if (host) await host.screenshot({ path: file });
    else await page.screenshot({ path: file });
    count++;
    console.log(`✓ ${file}`);
  }
}

await browser.close();
console.log(`\nCaptured ${count} screenshots to ${OUT}`);
