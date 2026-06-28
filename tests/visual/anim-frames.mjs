// Capture a few frames mid-entrance so the animation can be eyeballed.
// Usage: node anim-frames.mjs [scenarioId]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.GRAPHEIN_SHOTS ?? join(ROOT, 'tests', 'visual', '__shots__');
mkdirSync(OUT, { recursive: true });

const id = process.argv[2] ?? 'bar-quarter-region';
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.addInitScript(() => {
  window.__GRAPHEIN_DISABLE_ANIM = false;
});
await page.setViewportSize({ width: 720, height: 460 });
await page.goto(`${BASE}/?shot=${id}&w=640&h=400&theme=light`, { waitUntil: 'commit' });

let last = 0;
for (const ms of [80, 160, 280, 440, 650]) {
  await page.waitForTimeout(ms - last);
  last = ms;
  const host = await page.$('.shot-root > div');
  if (host) await host.screenshot({ path: join(OUT, `anim_${id}_${String(ms).padStart(3, '0')}ms.png`) });
  console.log(`✓ anim_${id}_${ms}ms.png`);
}

await browser.close();
console.log('done');
