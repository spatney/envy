// Hover screenshot runner — verifies tooltips / crosshair / focus highlight.
// Usage: node hover.mjs <scenarioId> [fx] [fy] [theme] [w] [h]
//   fx,fy = fractional cursor position within the chart (0..1). Default 0.5,0.5.

import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.ENVY_GALLERY ?? 'http://127.0.0.1:4317';
const OUT =
  process.env.ENVY_SHOTS ??
  'C:/Users/sapatney/.copilot/session-state/50c7b4d8-37fe-4e29-abd7-0188f62da234/files/shots';

mkdirSync(OUT, { recursive: true });

const id = process.argv[2] ?? 'line-multi';
const fx = Number(process.argv[3] ?? '0.5');
const fy = Number(process.argv[4] ?? '0.5');
const theme = process.argv[5] ?? 'light';
const w = Number(process.argv[6] ?? '580');
const h = Number(process.argv[7] ?? '360');

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.addInitScript(() => {
  window.__ENVY_DISABLE_ANIM = true;
});
await page.setViewportSize({ width: w + 40, height: h + 40 });
const url = `${BASE}/?shot=${id}&w=${w}&h=${h}&theme=${theme}`;
await page.goto(url, { waitUntil: 'load' });
try {
  await page.waitForSelector('[data-shot-ready="true"]', { timeout: 5000 });
} catch {
  console.warn(`! ${id} did not signal ready`);
}

const host = await page.$('.shot-root > div');
const box = await host.boundingBox();
const tx = box.x + box.width * fx;
const ty = box.y + box.height * fy;
await page.mouse.move(tx - 4, ty - 4);
await page.mouse.move(tx, ty); // two moves so pointermove always fires
await page.waitForTimeout(250);

const tag = `${id}__hover_${Math.round(fx * 100)}-${Math.round(fy * 100)}_${theme}`;
const file = `${OUT}/${tag}.png`;
await host.screenshot({ path: file });
console.log(`✓ ${file}`);

await browser.close();
