// Capture all gallery scenarios for visual review.
// Usage: node shoot-all.mjs [light|dark|both] [size]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
const OUT = process.env.GRAPHEIN_SHOTS ??
  'C:/Users/sapatney/.copilot/session-state/2003929f-cda2-4695-b063-05930979a0b6/files/shots';
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

const scenarios = [
  'line-single', 'line-multi', 'line-smooth', 'line-dense',
  'area-single', 'area-stacked',
  'bar-simple', 'bar-grouped', 'bar-stacked',
  'scatter-groups', 'pie-basic', 'donut-basic',
  'heatmap-week', 'kpi-basic', 'table-sales', 'matrix-region',
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.addInitScript(() => { window.__GRAPHEIN_DISABLE_ANIM = true; });
let count = 0;
for (const theme of themes) {
  for (const id of scenarios) {
    const url = `${BASE}/?shot=${id}&w=${size.w}&h=${size.h}&theme=${theme}`;
    await page.setViewportSize({ width: size.w + 40, height: size.h + 40 });
    await page.goto(url, { waitUntil: 'load' });
    try { await page.waitForSelector('[data-shot-ready="true"]', { timeout: 5000 }); }
    catch { console.warn(`! ${id} ${theme} not ready`); }
    const host = await page.$('.shot-root > div');
    const file = `${OUT}/${id}__${theme}.png`;
    if (host) await host.screenshot({ path: file }); else await page.screenshot({ path: file });
    count++;
    console.log(`OK ${file}`);
  }
}
await browser.close();
console.log(`\nCaptured ${count} screenshots to ${OUT}`);
