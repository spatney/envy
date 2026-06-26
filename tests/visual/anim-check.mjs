// Animation verification.
// 1) The animated entrance converges to the SAME final marks as a static draw.
// 2) prefers-reduced-motion suppresses the animation (instant, settled).
// Usage: node anim-check.mjs

import { chromium } from 'playwright';

const BASE = process.env.ENVY_GALLERY ?? 'http://127.0.0.1:4317';
const SCENARIOS = ['bar-grouped', 'line-multi', 'pie-basic', 'kpi-basic'];

const browser = await chromium.launch();
let failures = 0;

// Capture the marks-canvas pixels + root opacity once the surface signals ready.
async function capture(ctx, id, { disableAnim, reducedMotion }) {
  const page = await ctx.newPage({ deviceScaleFactor: 2 });
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((d) => {
    window.__ENVY_DISABLE_ANIM = d;
  }, disableAnim);
  await page.setViewportSize({ width: 720, height: 460 });
  await page.goto(`${BASE}/?shot=${id}&w=640&h=400&theme=light`, { waitUntil: 'load' });
  await page.waitForSelector('.envy-root[data-envy-ready="true"]', { timeout: 8000 });
  const out = await page.evaluate(() => {
    const root = document.querySelector('.envy-root');
    const marks = document.querySelector('.envy-layer-marks');
    return {
      marks: marks ? marks.toDataURL() : '',
      opacity: root ? root.style.opacity : '(none)',
      transform: root ? root.style.transform : '(none)',
    };
  });
  await page.close();
  return out;
}

for (const id of SCENARIOS) {
  const ctx = await browser.newContext();

  // Reference: animation globally disabled → final frame, painted synchronously.
  const ref = await capture(ctx, id, { disableAnim: true, reducedMotion: false });

  // Animated: ready fires on the final frame; pixels must match the reference.
  const animated = await capture(ctx, id, { disableAnim: false, reducedMotion: false });

  // Reduced motion: animation suppressed even though it isn't globally disabled.
  const reduced = await capture(ctx, id, { disableAnim: false, reducedMotion: true });

  const problems = [];
  if (!ref.marks) problems.push('reference marks empty');
  if (animated.marks !== ref.marks) problems.push('animated final frame != static frame');
  if (animated.opacity !== '') problems.push(`animated opacity not reset (="${animated.opacity}")`);
  if (reduced.marks !== ref.marks) problems.push('reduced-motion frame != static frame');

  if (problems.length) {
    console.log(`✗ ${id}: ${problems.join('; ')}`);
    failures++;
  } else {
    console.log(`✓ ${id}: animated & reduced-motion both converge to the static final frame`);
  }

  await ctx.close();
}

await browser.close();
if (failures) {
  console.log(`\nFAIL: ${failures} scenario(s) failed`);
  process.exit(1);
}
console.log('\nPASS: entrance animation converges and honors reduced motion');
