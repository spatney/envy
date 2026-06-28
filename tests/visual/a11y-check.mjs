// A11y DOM verification for rendered charts.
// Loads representative scenarios via the gallery /?shot= route and asserts the
// accessibility contract on the rendered surface. Usage: node a11y-check.mjs

import { chromium } from 'playwright';

const BASE = process.env.GRAPHEIN_GALLERY ?? 'http://127.0.0.1:4317';

// type: 'canvas' charts must expose a hidden data-table fallback;
// 'dom' charts (table/matrix/kpi) must NOT (their data is already real DOM).
const cases = [
  { id: 'bar-quarter-region', kind: 'canvas' },
  { id: 'line-regional-revenue', kind: 'canvas' },
  { id: 'pie-browser-share', kind: 'canvas' },
  { id: 'heatmap-traffic-week-hour', kind: 'canvas' },
  { id: 'kpi-arr', kind: 'dom' },
  { id: 'table-order-health', kind: 'dom' },
  { id: 'matrix-revenue-pivot', kind: 'dom' },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.setViewportSize({ width: 760, height: 460 });

let failures = 0;
for (const c of cases) {
  await page.goto(`${BASE}/?shot=${c.id}&w=640&h=400&theme=light`, { waitUntil: 'load' });
  try {
    await page.waitForSelector('[data-shot-ready="true"]', { timeout: 6000 });
  } catch {
    console.log(`✗ ${c.id}: never signaled ready`);
    failures++;
    continue;
  }

  const result = await page.$eval('.graphein-root', (root) => {
    const marks = root.querySelector('.graphein-layer-marks');
    const inter = root.querySelector('.graphein-layer-interaction');
    const fallback = root.querySelector('.graphein-a11y table');
    const visibleTable = root.querySelector('[role="table"], table:not(.graphein-a11y table)');
    return {
      role: root.getAttribute('role'),
      label: root.getAttribute('aria-label') || '',
      marksHidden: marks?.getAttribute('aria-hidden') === 'true',
      interHidden: inter?.getAttribute('aria-hidden') === 'true',
      hasFallback: !!fallback,
      fallbackHeaders: fallback ? fallback.querySelectorAll('thead th[scope="col"]').length : 0,
      fallbackHasCaption: fallback ? !!fallback.querySelector('caption') : false,
      hasVisibleTable: !!visibleTable,
    };
  });

  const problems = [];
  if (result.role !== 'figure') problems.push(`role=${result.role}`);
  if (!result.label) problems.push('empty aria-label');
  if (!result.marksHidden) problems.push('marks not aria-hidden');
  if (!result.interHidden) problems.push('interaction not aria-hidden');

  if (c.kind === 'canvas') {
    if (!result.hasFallback) problems.push('missing data-table fallback');
    if (result.fallbackHeaders < 1) problems.push('fallback has no scoped headers');
    if (!result.fallbackHasCaption) problems.push('fallback missing caption');
  } else {
    if (result.hasFallback) problems.push('unexpected hidden fallback');
    if (!result.hasVisibleTable && c.id !== 'kpi-arr') problems.push('missing visible table');
  }

  if (problems.length) {
    console.log(`✗ ${c.id} [${c.kind}]: ${problems.join(', ')}  label="${result.label}"`);
    failures++;
  } else {
    console.log(`✓ ${c.id} [${c.kind}]: role=figure label="${result.label}" fallbackHeaders=${result.fallbackHeaders}`);
  }
}

await browser.close();
if (failures) {
  console.log(`\nFAIL: ${failures} case(s) failed`);
  process.exit(1);
}
console.log('\nPASS: a11y contract verified across all chart kinds');
