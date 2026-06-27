/**
 * Gallery views — the content rendered into the persistent shell's swappable
 * `.content` area. Each renderer receives a {@link GalleryCtx} that owns theme,
 * navigation, chart mounting (responsive + tracked for disposal), and cleanup.
 *
 * The shell (main.ts) builds chrome + router + scroll memory ONCE; these views
 * only ever fill the content area, so navigating never rebuilds the whole page.
 */

import { render, type ChartSpec, type DashboardSpec } from '@envy/core';
import { scenarios, scenarioById, type Scenario } from './scenarios';
import { dashboardDemo } from './interactive';

export interface GalleryCtx {
  theme: 'light' | 'dark';
  sketch: boolean;
  reducedMotion: boolean;
  /** Set the route hash (e.g. 'gallery', 'chart/line-multi'). */
  navigate(hash: string): void;
  /** Apply the live theme + sketch and strip fixed dimensions (responsive). */
  themed(spec: ChartSpec): ChartSpec;
  /** Render a spec into a host that owns its (responsive) size; tracked for disposal. */
  mountChart(host: HTMLElement, spec: ChartSpec): void;
  /** Render the interactive dashboard demo; tracked for disposal. */
  mountDashboard(host: HTMLElement, spec: DashboardSpec): void;
  /** Register a teardown callback run when the content view is replaced. */
  addDisposer(fn: () => void): void;
  /** Seed the spec into the playground editor and navigate there. */
  openInPlayground(spec: ChartSpec): void;
}

/** A flat, vivid-but-not-neon hue per chart family — the gallery's playful accent. */
const GROUP_HUE: Record<string, string> = {
  Line: '#0ea5e9',
  Area: '#6366f1',
  Bar: '#0d9488',
  Scatter: '#f59e0b',
  Pie: '#ec4899',
  Funnel: '#d946ef',
  Heatmap: '#ef4444',
  KPI: '#10b981',
  Table: '#64748b',
  Matrix: '#8b5cf6',
  Box: '#14b8a6',
  Sankey: '#f97316',
  Choropleth: '#22c55e',
  Slicer: '#a855f7',
};

function hueFor(group: string): string {
  return GROUP_HUE[group] ?? '#0d9488';
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

/** Stagger entrance reveals; honor reduced-motion by emitting no delay. */
function reveal(node: HTMLElement, index: number, ctx: GalleryCtx): void {
  node.classList.add('reveal');
  if (!ctx.reducedMotion) node.style.setProperty('--d', `${Math.min(index * 40, 360)}ms`);
}

/** A compact, readable JSON view of a spec: big data arrays + geo are elided. */
export function summarizeSpec(spec: ChartSpec): string {
  const clone = JSON.parse(
    JSON.stringify(spec, (_k, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)),
  ) as Record<string, unknown>;
  const src = spec as unknown as Record<string, unknown>;
  if (Array.isArray(clone.data) && clone.data.length > 6) {
    clone.data = [...clone.data.slice(0, 4), `…${clone.data.length - 4} more rows`];
  }
  if (clone.geo) {
    const feats = (src.geo as { features?: unknown[] } | undefined)?.features?.length ?? '?';
    clone.geo = `‹GeoFeatureCollection · ${feats} features›`;
  }
  if (Array.isArray(clone.columns) && clone.columns.length > 8) {
    clone.columns = [...clone.columns.slice(0, 6), `…${clone.columns.length - 6} more`];
  }
  return JSON.stringify(clone, null, 2);
}

function makeCopyButton(getText: () => string): HTMLButtonElement {
  const btn = el('button', 'btn btn-ghost btn-sm');
  btn.textContent = 'Copy';
  btn.onclick = () => {
    void navigator.clipboard?.writeText(getText());
    btn.textContent = 'Copied';
    window.setTimeout(() => (btn.textContent = 'Copy'), 1200);
  };
  return btn;
}

// ===========================================================================
// Home
// ===========================================================================

const ROTATOR_WORDS = ['dashboards', 'trends', 'flows', 'maps', 'comparisons', 'distributions'];
const HERO_SPECS = ['area-stacked', 'bar-stacked', 'line-multi', 'scatter-groups'];

const STATS: [string, string][] = [
  ['13', 'chart types'],
  ['0', 'runtime deps'],
  ['3', 'render modes'],
  ['50k', 'points, smooth'],
  ['OKLab', 'color engine'],
  ['JSON', 'in · chart out'],
];

export function renderHome(content: HTMLElement, ctx: GalleryCtx): void {
  const page = el('div', 'page');
  content.appendChild(page);

  // ---- Hero -----------------------------------------------------------------
  const hero = el('section', 'hero reveal');
  const copy = el('div', 'hero-copy');
  copy.appendChild(el('span', 'eyebrow', '<span class="dot"></span>Agent-first data visualization'));

  const title = el('h1', 'hero-title');
  title.innerHTML =
    'Beautiful <span class="rotator accent">dashboards</span><br>from a single ' +
    '<span class="accent">JSON</span> spec.';
  copy.appendChild(title);

  copy.appendChild(
    el(
      'p',
      'hero-sub',
      'Envy turns a declarative <code>ChartSpec</code> into a Tableau-class visual — ' +
        'rendered on a fast, zero-dependency Canvas2D + DOM core. Shape your data, pick a ' +
        'type, validate, render. That\u2019s it.',
    ),
  );

  const cta = el('div', 'hero-cta');
  const exploreBtn = el('button', 'btn btn-primary');
  exploreBtn.textContent = 'Explore the gallery →';
  exploreBtn.onclick = () => ctx.navigate('gallery');
  const pgBtn = el('button', 'btn');
  pgBtn.textContent = '✦ Open the playground';
  pgBtn.onclick = () => ctx.navigate('playground');
  const learnBtn = el('button', 'btn btn-ghost');
  learnBtn.textContent = 'Learn the model';
  learnBtn.onclick = () => ctx.navigate('learn');
  cta.append(exploreBtn, pgBtn, learnBtn);
  copy.appendChild(cta);
  hero.appendChild(copy);

  // Live, crossfading hero chart showcasing breadth.
  const art = el('div', 'hero-art');
  art.appendChild(
    el(
      'div',
      'hero-art-bar',
      '<i></i><i></i><i></i><span class="hero-art-label">one spec, rendered live</span>',
    ),
  );
  const heroChart = el('div', 'hero-chart');
  art.appendChild(heroChart);
  hero.appendChild(art);
  page.appendChild(hero);

  mountHeroChart(heroChart, ctx);
  if (!ctx.reducedMotion) startRotator(title.querySelector('.rotator') as HTMLElement, ctx);

  // ---- Stats ----------------------------------------------------------------
  const stats = el('div', 'stats reveal');
  stats.style.setProperty('--d', '80ms');
  for (const [num, label] of STATS) {
    const stat = el('div', 'stat');
    stat.appendChild(el('div', 'stat-num', num));
    stat.appendChild(el('div', 'stat-label', label));
    stats.appendChild(stat);
  }
  page.appendChild(stats);

  // ---- Featured grid --------------------------------------------------------
  const featured = scenarios.filter((s) => s.featured);
  const section = el('section', 'section');
  const head = el('div', 'section-head');
  head.appendChild(
    el(
      'div',
      undefined,
      '<h2 class="section-title">A taste of the range</h2>' +
        '<p class="section-sub">Every tile is one live <code>ChartSpec</code> — click to dig in.</p>',
    ),
  );
  const allLink = el('button', 'section-link', `Browse all ${scenarios.length} →`);
  allLink.onclick = () => ctx.navigate('gallery');
  head.appendChild(allLink);
  section.appendChild(head);

  const grid = el('div', 'feature-grid');
  featured.forEach((s, i) => grid.appendChild(buildCard(s, ctx, i, 'fcard')));
  section.appendChild(grid);
  page.appendChild(section);

  // ---- How it works ---------------------------------------------------------
  const steps = el('section', 'section');
  steps.appendChild(
    el(
      'div',
      'section-head',
      '<div><h2 class="section-title">Three steps to a chart</h2>' +
        '<p class="section-sub">No imperative drawing, no D3 incantations.</p></div>',
    ),
  );
  const stepGrid = el('div', 'concept-grid');
  const STEPS: [string, string, string][] = [
    ['01', 'Shape a tidy table', 'One row per observation, one column per variable. Don\u2019t pre-pivot — add a <code>series</code> to split groups.'],
    ['02', 'Pick a type + encoding', 'Choose <code>line</code>, <code>bar</code>, <code>scatter</code>\u2026 and map columns to channels like <code>x</code>, <code>y</code>, <code>color</code>.'],
    ['03', 'Validate, then render', 'Run <code>validateSpec(spec)</code> for friendly, path-pointed errors, then <code>render(el, spec)</code>.'],
  ];
  STEPS.forEach(([n, t, b], i) => {
    const c = el('div', 'concept');
    c.appendChild(el('div', 'kicker', n));
    c.appendChild(el('h3', 'concept-title', t));
    c.appendChild(el('p', 'concept-body', b));
    reveal(c, i, ctx);
    stepGrid.appendChild(c);
  });
  steps.appendChild(stepGrid);
  page.appendChild(steps);

  page.appendChild(buildFooter(ctx));
}

function mountHeroChart(host: HTMLElement, ctx: GalleryCtx): void {
  const specs = HERO_SPECS.map((id) => scenarioById(id)).filter(Boolean) as Scenario[];
  if (!specs.length) return;
  let disposed = false;
  let idx = 0;
  let inst = render(host, ctx.themed(specs[0].spec()));
  const ro = new ResizeObserver(() => {
    try {
      inst?.resize();
    } catch {
      /* host gone */
    }
  });
  ro.observe(host);

  let swapTimer: number | undefined;
  let cycleTimer: number | undefined;
  if (!ctx.reducedMotion && specs.length > 1) {
    cycleTimer = window.setInterval(() => {
      if (disposed) return;
      host.style.opacity = '0';
      swapTimer = window.setTimeout(() => {
        if (disposed) return;
        try {
          inst?.destroy();
        } catch {
          /* ignore */
        }
        idx = (idx + 1) % specs.length;
        inst = render(host, ctx.themed(specs[idx].spec()));
        host.style.opacity = '1';
      }, 320);
    }, 4200);
  }

  ctx.addDisposer(() => {
    disposed = true;
    window.clearInterval(cycleTimer);
    window.clearTimeout(swapTimer);
    ro.disconnect();
    try {
      inst?.destroy();
    } catch {
      /* ignore */
    }
  });
}

function startRotator(node: HTMLElement, ctx: GalleryCtx): void {
  let i = 0;
  let disposed = false;
  let swap: number | undefined;
  const timer = window.setInterval(() => {
    if (disposed) return;
    node.classList.add('swap');
    swap = window.setTimeout(() => {
      if (disposed) return;
      i = (i + 1) % ROTATOR_WORDS.length;
      node.textContent = ROTATOR_WORDS[i];
      node.classList.remove('swap');
    }, 280);
  }, 2600);
  ctx.addDisposer(() => {
    disposed = true;
    window.clearInterval(timer);
    window.clearTimeout(swap);
  });
}

// ===========================================================================
// Gallery
// ===========================================================================

export function renderGalleryView(content: HTMLElement, ctx: GalleryCtx): void {
  const page = el('div', 'page');
  content.appendChild(page);

  const head = el('div', 'gallery-head reveal');
  head.appendChild(
    el(
      'div',
      'gallery-title-row',
      '<h1 class="section-title">Gallery</h1>' +
        `<span class="gallery-count">${scenarios.length} live examples</span>`,
    ),
  );

  // Search
  const search = el('div', 'search');
  search.appendChild(el('span', 'search-icon', '⌕'));
  const input = el('input', 'search-input') as HTMLInputElement;
  input.type = 'search';
  input.placeholder = 'Search charts by name, family, or keyword…';
  input.setAttribute('autocomplete', 'off');
  search.appendChild(input);
  search.appendChild(el('span', 'search-kbd', '/'));
  head.appendChild(search);

  // Family filter chips
  const groups = [...new Set(scenarios.map((s) => s.group))];
  const filters = el('div', 'filters');
  let activeGroup = 'All';
  const chipEls: HTMLButtonElement[] = [];
  for (const g of ['All', ...groups]) {
    const chip = el('button', 'chip' + (g === 'All' ? ' active' : ''));
    chip.textContent = g;
    if (g !== 'All') chip.style.setProperty('--hue', hueFor(g));
    chip.onclick = () => {
      activeGroup = g;
      chipEls.forEach((c) => c.classList.toggle('active', c === chip));
      applyFilter();
    };
    chipEls.push(chip);
    filters.appendChild(chip);
  }
  head.appendChild(filters);
  page.appendChild(head);

  // Grid — render every card once, then filter by visibility (no re-mount).
  const grid = el('div', 'card-grid');
  const cards: { scenario: Scenario; node: HTMLElement }[] = [];
  scenarios.forEach((s, i) => {
    const node = buildCard(s, ctx, i, 'gcard');
    cards.push({ scenario: s, node });
    grid.appendChild(node);
  });
  page.appendChild(grid);

  const empty = el('div', 'empty');
  empty.innerHTML = '<div class="empty-mark">🔍</div>No charts match that search.';
  empty.style.display = 'none';
  page.appendChild(empty);

  const applyFilter = (): void => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    for (const { scenario, node } of cards) {
      const inGroup = activeGroup === 'All' || scenario.group === activeGroup;
      const hay = `${scenario.title} ${scenario.group} ${scenario.keywords ?? ''} ${scenario.blurb ?? ''}`.toLowerCase();
      const match = inGroup && (!q || hay.includes(q));
      node.style.display = match ? '' : 'none';
      if (match) visible++;
    }
    empty.style.display = visible ? 'none' : '';
  };
  input.addEventListener('input', applyFilter);

  // `/` focuses search (unless already typing in a field).
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
      e.preventDefault();
      input.focus();
    }
  };
  document.addEventListener('keydown', onKey);
  ctx.addDisposer(() => document.removeEventListener('keydown', onKey));
}

function buildCard(s: Scenario, ctx: GalleryCtx, index: number, kind: 'gcard' | 'fcard'): HTMLElement {
  const card = el('button', kind + (kind === 'gcard' && s.wide ? ' wide' : ''));
  card.style.setProperty('--hue', hueFor(s.group));
  card.onclick = () => ctx.navigate(`chart/${s.id}`);

  const chart = el('div', kind === 'gcard' ? 'gcard-chart' : 'fcard-chart');
  card.appendChild(chart);

  const foot = el('div', kind === 'gcard' ? 'gcard-foot' : 'fcard-meta');
  const title = el('div', kind === 'gcard' ? 'gcard-title' : 'fcard-title');
  title.innerHTML = `<span class="badge" style="--hue:${hueFor(s.group)}">${s.group}</span>${s.title.replace(/^[^—]*—\s*/, '')}`;
  foot.appendChild(title);
  if (s.blurb) foot.appendChild(el('div', kind === 'gcard' ? 'gcard-blurb' : 'fcard-blurb', s.blurb));
  card.appendChild(foot);

  reveal(card, index, ctx);
  ctx.mountChart(chart, s.spec());
  return card;
}

// ===========================================================================
// Detail
// ===========================================================================

const STRIP_SIZES = [
  { name: 'Small', w: 360, h: 240 },
  { name: 'Medium', w: 560, h: 340 },
  { name: 'Tall', w: 420, h: 520 },
];

export function renderDetail(content: HTMLElement, scenario: Scenario, ctx: GalleryCtx): void {
  const page = el('div', 'page');
  content.appendChild(page);

  // Header + breadcrumb + actions
  const top = el('div', 'detail-top reveal');
  const titleGroup = el('div');
  const crumbs = el('div', 'crumbs');
  const galleryCrumb = el('button', 'crumb', 'Gallery');
  galleryCrumb.onclick = () => ctx.navigate('gallery');
  crumbs.append(galleryCrumb, el('span', undefined, '/'), el('span', undefined, scenario.group));
  titleGroup.appendChild(crumbs);
  titleGroup.appendChild(el('h1', 'detail-title', scenario.title));
  titleGroup.appendChild(
    el(
      'p',
      'detail-sub',
      `${scenario.blurb ? scenario.blurb + ' · ' : ''}rendered live in ${ctx.theme}${ctx.sketch ? ' · sketch' : ''}`,
    ),
  );
  top.appendChild(titleGroup);

  const actions = el('div', 'detail-actions');
  const editBtn = el('button', 'btn');
  editBtn.textContent = '✦ Edit in Playground';
  editBtn.onclick = () => ctx.openInPlayground(scenario.spec());
  actions.appendChild(editBtn);
  top.appendChild(actions);
  page.appendChild(top);

  // Feature chart
  const feature = el('div', 'card feature-card reveal');
  feature.style.setProperty('--d', '60ms');
  const featHost = el('div', 'feature-host');
  feature.appendChild(featHost);
  page.appendChild(feature);
  ctx.mountChart(featHost, scenario.spec());

  // Spec
  const specText = summarizeSpec(scenario.spec());
  const specCard = el('div', 'card spec-card reveal');
  specCard.style.setProperty('--d', '100ms');
  const specHead = el('div', 'spec-head');
  specHead.appendChild(el('span', 'spec-title', `ChartSpec · type: "${(scenario.spec() as { type?: string }).type ?? '?'}"`));
  specHead.appendChild(makeCopyButton(() => specText));
  const pre = el('pre', 'spec-pre');
  pre.textContent = specText;
  specCard.append(specHead, pre);
  page.appendChild(specCard);

  // Responsive strip
  page.appendChild(el('div', 'section-label', 'Responsive — the same spec, different sizes'));
  const strip = el('div', 'strip');
  STRIP_SIZES.forEach((size, i) => {
    const card = el('div', 'strip-card');
    card.appendChild(el('div', 'size-label', `${size.name} · ${size.w}×${size.h}`));
    const host = el('div', 'chart-host');
    host.style.width = `${size.w}px`;
    host.style.height = `${size.h}px`;
    card.appendChild(host);
    reveal(card, i, ctx);
    strip.appendChild(card);
    ctx.mountChart(host, scenario.spec());
  });
  page.appendChild(strip);

  // Prev / next
  const idx = scenarios.findIndex((s) => s.id === scenario.id);
  const prev = scenarios[(idx - 1 + scenarios.length) % scenarios.length];
  const next = scenarios[(idx + 1) % scenarios.length];
  const pager = el('div', 'pager');
  const prevBtn = el('button', 'pager-btn pager-prev');
  prevBtn.innerHTML = `<span class="pager-dir">← Previous</span><span class="pager-name">${prev.title}</span>`;
  prevBtn.onclick = () => ctx.navigate(`chart/${prev.id}`);
  const nextBtn = el('button', 'pager-btn pager-next');
  nextBtn.innerHTML = `<span class="pager-dir">Next →</span><span class="pager-name">${next.title}</span>`;
  nextBtn.onclick = () => ctx.navigate(`chart/${next.id}`);
  pager.append(prevBtn, nextBtn);
  page.appendChild(pager);
}

// ===========================================================================
// Dashboard
// ===========================================================================

export function renderDashboardView(content: HTMLElement, ctx: GalleryCtx): void {
  const page = el('div', 'page');
  content.appendChild(page);

  const top = el('div', 'detail-top reveal');
  top.appendChild(
    el(
      'div',
      undefined,
      '<h1 class="detail-title">Interactive dashboard</h1>' +
        `<p class="detail-sub">Auto-wired cross-filter + cross-highlight · rendered live in ${ctx.theme}</p>`,
    ),
  );
  page.appendChild(top);

  const tip = el('div', 'tip reveal');
  tip.style.setProperty('--d', '60ms');
  tip.innerHTML =
    'Pick regions/products in the slicers to <strong>cross-filter</strong> every visual; click a bar to ' +
    '<strong>cross-highlight</strong> the trend. It\u2019s one <code>DashboardSpec</code> with ' +
    "<code>interactions: 'auto'</code> — no manual wiring.";
  page.appendChild(tip);

  const frame = el('div', 'dash-frame reveal');
  frame.style.setProperty('--d', '100ms');
  const host = el('div');
  host.style.width = '100%';
  frame.appendChild(host);
  page.appendChild(frame);
  ctx.mountDashboard(host, dashboardDemo());

  const specText = summarizeSpec(dashboardDemo() as unknown as ChartSpec);
  const specCard = el('div', 'card spec-card reveal');
  specCard.style.setProperty('--d', '140ms');
  const specHead = el('div', 'spec-head');
  specHead.appendChild(el('span', 'spec-title', 'DashboardSpec'));
  specHead.appendChild(makeCopyButton(() => specText));
  const pre = el('pre', 'spec-pre');
  pre.textContent = specText;
  specCard.append(specHead, pre);
  page.appendChild(specCard);
}

// ===========================================================================
// Learn
// ===========================================================================

export function renderLearn(content: HTMLElement, ctx: GalleryCtx): void {
  const page = el('div', 'page');
  content.appendChild(page);

  const head = el('div', 'reveal');
  head.appendChild(el('h1', 'section-title', 'Learn Envy'));
  head.appendChild(
    el(
      'p',
      'learn-intro',
      'Envy is built so an agent (or a human) can produce a great chart by emitting a single ' +
        'JSON-serializable spec. Here\u2019s the whole mental model on one page.',
    ),
  );
  page.appendChild(head);

  const grid = el('div', 'concept-grid');

  const concept = (opts: {
    kicker: string;
    title: string;
    body: string;
    code?: string;
    wide?: boolean;
    chart?: ChartSpec;
    channels?: string[];
    index: number;
  }): void => {
    const c = el('div', 'concept' + (opts.wide ? ' wide' : ''));
    c.appendChild(el('div', 'kicker', opts.kicker));
    c.appendChild(el('h3', 'concept-title', opts.title));
    c.appendChild(el('p', 'concept-body', opts.body));
    if (opts.channels) {
      const list = el('div', 'channel-list');
      for (const ch of opts.channels) list.appendChild(el('span', 'channel', ch));
      c.appendChild(list);
    }
    if (opts.code) {
      const pre = el('pre', 'concept-code');
      pre.textContent = opts.code;
      c.appendChild(pre);
    }
    if (opts.chart) {
      const host = el('div', 'concept-chart');
      c.appendChild(host);
      ctx.mountChart(host, opts.chart);
    }
    reveal(c, opts.index, ctx);
    grid.appendChild(c);
  };

  concept({
    kicker: 'The one rule',
    title: 'A chart is one ChartSpec',
    body: 'Give it a type, a flat data array, and (for cartesian charts) an encoding mapping columns to channels. That object is the entire chart.',
    wide: true,
    index: 0,
    code: `const spec = {
  type: 'line',
  data: [
    { month: '2024-01', users: 4200 },
    { month: '2024-02', users: 4650 },
    { month: '2024-03', users: 5010 },
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'users' },
  },
  title: 'Monthly active users',
};
render('#app', spec);`,
  });

  concept({
    kicker: 'Data',
    title: 'Tidy tables, not pivots',
    body: 'One row per observation, one column per variable. Don\u2019t pre-pivot — add a series channel to split groups, and Envy handles the rest.',
    index: 1,
    chart: scenarioById('line-multi')?.spec(),
  });

  concept({
    kicker: 'Encoding',
    title: 'Map columns to channels',
    body: 'Channels are how data becomes pixels. Cartesian charts use x / y / series; others use size, color, theta, source/target, and more.',
    index: 2,
    channels: ['x', 'y', 'series', 'color', 'size', 'theta', 'source', 'target'],
  });

  concept({
    kicker: 'Safety',
    title: 'Validate, then render',
    body: 'validateSpec is pure and dependency-free. Run it on every generated spec and fix each error before rendering — warnings are advisory.',
    index: 3,
    code: `const { valid, errors, warnings } = validateSpec(spec);
if (!valid) {
  for (const e of errors) {
    console.error(e.path, e.message);
  }
}
// only render once valid
render('#app', spec);`,
  });

  concept({
    kicker: 'Looks',
    title: 'Themes & a sketch mode',
    body: 'Set theme: "light" | "dark", or flip sketch: true for a playful hand-drawn render — same spec, deterministic output. Try the toggles up top.',
    index: 4,
    chart: { ...(scenarioById('bar-stacked')?.spec() as ChartSpec), sketch: true } as ChartSpec,
  });

  concept({
    kicker: 'Interactivity',
    title: 'Slicers & dashboards',
    body: 'Add params, highlight, and filter to link visuals; drop in slicer controls; or compose a DashboardSpec with interactions: "auto" for cross-filtering — all still pure JSON.',
    index: 5,
    chart: scenarioById('slicer-range')?.spec(),
  });

  page.appendChild(grid);

  const cta = el('div', 'foot');
  const left = el('div', undefined, 'Ready to build one? Open the playground and start from a preset.');
  const right = el('button', 'btn btn-primary');
  right.textContent = 'Open the playground →';
  right.onclick = () => ctx.navigate('playground');
  cta.append(left, right);
  page.appendChild(cta);
}

function buildFooter(ctx: GalleryCtx): HTMLElement {
  const footer = el('footer', 'foot');
  footer.appendChild(
    el('div', undefined, 'Built with <code>@envy/core</code> — zero runtime dependencies.'),
  );
  const link = el('button', 'section-link', 'Explore the gallery →');
  link.onclick = () => ctx.navigate('gallery');
  footer.appendChild(link);
  return footer;
}
