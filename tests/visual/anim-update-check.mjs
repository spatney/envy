// Update-transition verification.
// On update(), the marks layer cross-fades from the previous frame to the next.
// 1) The animated cross-fade settles to the SAME marks as an instant update.
// 2) prefers-reduced-motion (and the kill-switch) suppress it (instant, settled).
// Usage: node anim-update-check.mjs

import { chromium } from 'playwright';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';
// Canvas-mark scenarios (cross-fade applies). DOM charts update instantly.
const SCENARIOS = ['bar-grouped', 'line-multi', 'area-stacked', 'scatter-groups', 'pie-basic'];

// Deterministic perturbation of every numeric data field — changes the marks
// without depending on which field is encoded. Both pages apply the same one.
function applyVariant() {
  const inst = window.__grapheinChart;
  const spec = JSON.parse(JSON.stringify(inst.spec));
  if (Array.isArray(spec.data)) {
    spec.data = spec.data.map((row) => {
      const out = { ...row };
      for (const k of Object.keys(out)) {
        if (typeof out[k] === 'number') out[k] = out[k] * 0.55 + 7;
      }
      return out;
    });
  }
  inst.update(spec);
}

const browser = await chromium.launch();
let failures = 0;

async function capture(ctx, id, { disableAnim, reducedMotion }) {
  const page = await ctx.newPage({ deviceScaleFactor: 2 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((d) => {
    window.__GRAPHEIN_DISABLE_ANIM = d;
  }, disableAnim);
  await page.setViewportSize({ width: 720, height: 460 });
  await page.goto(`${BASE}/?shot=${id}&w=640&h=400&theme=light`, { waitUntil: 'load' });
  await page.waitForSelector('.graphein-root[data-graphein-ready="true"]', { timeout: 8000 });

  // The web font loads lazily on first text measurement (triggered by the initial
  // render above), so wait for it here — otherwise a page that happens to update
  // before the font settles would lay out with fallback metrics and diverge.
  await page.evaluate(() => document.fonts.ready);

  // Drive an update, then let any cross-fade fully settle before sampling.
  await page.evaluate(applyVariant);
  await page.waitForTimeout(disableAnim || reducedMotion ? 80 : 750);

  const marks = await page.evaluate(() => {
    const el = document.querySelector('.graphein-layer-marks');
    return el ? el.toDataURL() : '';
  });
  await page.close();
  return marks;
}

for (const id of SCENARIOS) {
  const ctx = await browser.newContext();

  // Reference: animation globally disabled → instant update, final marks.
  const ref = await capture(ctx, id, { disableAnim: true, reducedMotion: false });
  // Animated: cross-fade; after settling the marks must match the reference.
  const animated = await capture(ctx, id, { disableAnim: false, reducedMotion: false });
  // Reduced motion: cross-fade suppressed even though not globally disabled.
  const reduced = await capture(ctx, id, { disableAnim: false, reducedMotion: true });

  const problems = [];
  if (!ref) problems.push('reference marks empty');
  if (animated !== ref) problems.push('animated cross-fade final frame != instant frame');
  if (reduced !== ref) problems.push('reduced-motion frame != instant frame');

  if (problems.length) {
    console.log(`✗ ${id}: ${problems.join('; ')}`);
    failures++;
  } else {
    console.log(`✓ ${id}: update cross-fade settles to the instant frame & honors reduced motion`);
  }

  await ctx.close();
}

await browser.close();
if (failures) {
  console.log(`\nFAIL: ${failures} scenario(s) failed`);
  process.exit(1);
}
console.log('\nPASS: update cross-fade converges and honors reduced motion');
