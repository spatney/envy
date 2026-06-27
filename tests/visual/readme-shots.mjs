// Generates the clean chart screenshots embedded in the repo README.
// Output: docs/images/<name>.png  (committed assets)
// Usage: node tests/visual/readme-shots.mjs   (gallery dev server must be running)

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'images');
mkdirSync(OUT, { recursive: true });

// name, scenario id, size, theme, sketch
const SHOTS = [
  // Core grid — light
  ['line-multi', 'line-multi', 720, 440],
  ['bar-grouped', 'bar-grouped', 720, 440],
  ['area-stacked', 'area-stacked', 720, 440],
  ['scatter-groups', 'scatter-groups', 720, 440],
  ['donut', 'donut-basic', 720, 440],
  ['heatmap', 'heatmap-week', 720, 440],
  ['box', 'box-basic', 720, 440],
  ['kpi', 'kpi-basic', 720, 440],
  // Wide features
  ['sankey', 'sankey-energy', 1180, 520],
  ['choropleth', 'choropleth-states', 1180, 560],
  ['table', 'table-sales', 1180, 520],
  ['line-dense', 'line-dense', 1180, 460],
  // One spec, three looks
  ['modes-light', 'box-basic', 640, 420, 'light', false],
  ['modes-dark', 'box-basic', 640, 420, 'dark', false],
  ['modes-sketch', 'box-basic', 640, 420, 'light', true],
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.addInitScript(() => {
  window.__GRAPHEIN_DISABLE_ANIM = true;
});

let n = 0;
const only = process.argv[2]; // optional substring filter on shot name
for (const [name, id, w, h, theme = 'light', sketch = false] of SHOTS) {
  if (only && !name.includes(only)) continue;
  const url = `${BASE}/?shot=${id}&w=${w}&h=${h}&theme=${theme}${sketch ? '&sketch=1' : ''}`;
  await page.setViewportSize({ width: w + 40, height: h + 40 });
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.waitForSelector('[data-shot-ready="true"]', { timeout: 6000 });
  } catch {
    console.warn(`! ${name} did not signal ready`);
  }
  const host = await page.$('.shot-root > div');
  const file = join(OUT, `${name}.png`);
  if (host) await host.screenshot({ path: file });
  else await page.screenshot({ path: file });
  n++;
  console.log(`\u2713 ${file}`);
}

await browser.close();
console.log(`\nCaptured ${n} README images to ${OUT}`);
