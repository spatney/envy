import './style.css';
import { render, type ChartSpec, type ChartInstance } from '@envy/core';
import { scenarios, scenarioById, type Scenario } from './scenarios';
import { mountPlayground, type PlaygroundHandle } from './playground';

const PLAYGROUND_ID = '__playground__';
const OVERVIEW_ID = '__overview__';
const REPO_URL = 'https://github.com/spatney/envy';

const SIZES = [
  { name: 'Small', w: 360, h: 240 },
  { name: 'Medium', w: 580, h: 360 },
  { name: 'Large', w: 860, h: 480 },
  { name: 'Wide', w: 980, h: 300 },
  { name: 'Tall', w: 440, h: 560 },
];

/**
 * Curated front-page mosaic — one strong example per chart family. `span` cards
 * stretch the full width to give wide charts (flows, maps, tables) room to read.
 */
const OVERVIEW: { id: string; span?: boolean; h: number }[] = [
  { id: 'line-multi', h: 300 },
  { id: 'bar-grouped', h: 300 },
  { id: 'sankey-energy', span: true, h: 360 },
  { id: 'area-stacked', h: 300 },
  { id: 'scatter-groups', h: 300 },
  { id: 'choropleth-states', span: true, h: 420 },
  { id: 'donut-basic', h: 300 },
  { id: 'box-basic', h: 300 },
  { id: 'heatmap-week', h: 300 },
  { id: 'kpi-basic', h: 300 },
  { id: 'table-sales', span: true, h: 420 },
  { id: 'line-dense', span: true, h: 340 },
];

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

function withSize(spec: ChartSpec, w: number, h: number, theme?: string, sketch?: boolean): ChartSpec {
  const next = {
    ...spec,
    dimensions: { width: w, height: h },
    theme: theme ?? spec.theme,
  } as ChartSpec & { sketch?: unknown };
  // The toggle is authoritative: ON enables sketch (keeping any richer config the
  // spec already carries), OFF strips it so the chart renders clean.
  if (sketch) {
    if (next.sketch == null) next.sketch = true;
  } else {
    delete next.sketch;
  }
  return next as ChartSpec;
}

/** Apply the live theme/sketch but leave sizing to the container (responsive). */
function themed(spec: ChartSpec): ChartSpec {
  const next = { ...spec, theme: currentTheme } as ChartSpec & {
    sketch?: unknown;
    dimensions?: unknown;
  };
  if (currentSketch) {
    if (next.sketch == null) next.sketch = true;
  } else {
    delete next.sketch;
  }
  delete next.dimensions;
  return next as ChartSpec;
}

/** Deterministic single-chart route for Playwright: ?shot=<id>&w=&h=&theme= */
async function renderShot(): Promise<void> {
  // Entrance animations would make screenshots non-deterministic; disable them
  // for the shot route by default (a test can opt in by pre-setting the flag).
  {
    const g = window as unknown as { __ENVY_DISABLE_ANIM?: boolean };
    if (g.__ENVY_DISABLE_ANIM === undefined) g.__ENVY_DISABLE_ANIM = true;
  }
  app.remove();
  const id = params.get('shot')!;
  const w = Number(params.get('w') ?? 800);
  const h = Number(params.get('h') ?? 480);
  const theme = params.get('theme') ?? 'light';
  const sketch = params.get('sketch') === '1' || params.get('sketch') === 'true';
  const scenario = scenarioById(id);
  const root = document.createElement('div');
  root.className = 'shot-root' + (theme === 'dark' ? ' theme-dark-bg' : '');
  document.body.appendChild(root);

  const host = document.createElement('div');
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  root.appendChild(host);

  if (scenario) {
    const instance = render(host, withSize(scenario.spec(), w, h, theme, sketch));
    // Expose the instance so update()-transition tests can drive it.
    (window as unknown as { __envyChart?: ChartInstance }).__envyChart = instance;
  } else {
    host.textContent = `Unknown scenario: ${id}`;
  }

  // Web fonts load lazily on first text measurement, so the meaningful wait is
  // *after* render() has requested them. The runtime also re-lays-out on
  // fonts.ready, so by the time this resolves the final frame uses real metrics.
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;

  document.documentElement.setAttribute('data-shot-ready', 'true');
}

let currentTheme: 'light' | 'dark' = (params.get('theme') as 'light' | 'dark') ?? 'light';
let currentSketch = params.get('sketch') === '1' || params.get('sketch') === 'true';
let activeId = location.hash.slice(1) || OVERVIEW_ID;
const instances: ChartInstance[] = [];
let playground: PlaygroundHandle | undefined;
let resizeObs: ResizeObserver | undefined;
const resizeMap = new Map<Element, ChartInstance>();

function clearInstances(): void {
  playground?.dispose();
  playground = undefined;
  resizeObs?.disconnect();
  resizeObs = undefined;
  resizeMap.clear();
  for (const i of instances) i.destroy();
  instances.length = 0;
}

/** Render a spec into a container that owns its own (responsive) size. */
function renderResponsive(host: HTMLElement, spec: ChartSpec): void {
  try {
    const inst = render(host, themed(spec));
    instances.push(inst);
    resizeMap.set(host, inst);
    resizeObs ??= new ResizeObserver((entries) => {
      for (const e of entries) resizeMap.get(e.target)?.resize();
    });
    resizeObs.observe(host);
  } catch (err) {
    host.textContent = String(err);
  }
}

function toggleTheme(): void {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  renderGallery();
}

function toggleSketch(): void {
  currentSketch = !currentSketch;
  renderGallery();
}

function navigate(id: string): void {
  activeId = id;
  location.hash = id;
  renderGallery();
}

// ---- Chrome ----------------------------------------------------------------

function buildTopbar(): HTMLElement {
  const bar = document.createElement('header');
  bar.className = 'topbar';

  const brand = document.createElement('button');
  brand.className = 'brand';
  brand.title = 'Overview';
  brand.innerHTML =
    '<span class="brand-mark">E</span>' +
    '<span class="brand-text"><span class="brand-name">Envy</span>' +
    '<span class="tagline">agent-first data visualization</span></span>';
  brand.onclick = () => navigate(OVERVIEW_ID);
  bar.appendChild(brand);

  const actions = document.createElement('div');
  actions.className = 'topbar-actions';

  // Sketch toggle is meaningful for the showcase views; the playground owns its
  // own (JSON-mutating) sketch button, so hide the global one there.
  if (activeId !== PLAYGROUND_ID) {
    const sketchBtn = document.createElement('button');
    sketchBtn.className = 'btn' + (currentSketch ? ' active' : '');
    sketchBtn.textContent = currentSketch ? '✏ Sketch: on' : '✐ Sketch: off';
    sketchBtn.title = 'Toggle the hand-drawn sketch renderer';
    sketchBtn.onclick = toggleSketch;
    actions.appendChild(sketchBtn);
  }

  const themeBtn = document.createElement('button');
  themeBtn.className = 'btn';
  themeBtn.textContent = currentTheme === 'dark' ? '☀ Light' : '☾ Dark';
  themeBtn.onclick = toggleTheme;
  actions.appendChild(themeBtn);

  const gh = document.createElement('a');
  gh.className = 'btn btn-ghost';
  gh.href = REPO_URL;
  gh.target = '_blank';
  gh.rel = 'noreferrer';
  gh.textContent = 'GitHub ↗';
  actions.appendChild(gh);

  bar.appendChild(actions);
  return bar;
}

function buildSidebar(): HTMLElement {
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';

  const home = document.createElement('button');
  home.className = 'nav-item nav-feature' + (activeId === OVERVIEW_ID ? ' active' : '');
  home.innerHTML = '<span class="nav-ico">◆</span>Overview';
  home.onclick = () => navigate(OVERVIEW_ID);
  sidebar.appendChild(home);

  const pgBtn = document.createElement('button');
  pgBtn.className = 'nav-item nav-feature' + (activeId === PLAYGROUND_ID ? ' active' : '');
  pgBtn.innerHTML = '<span class="nav-ico">✦</span>Playground';
  pgBtn.onclick = () => navigate(PLAYGROUND_ID);
  sidebar.appendChild(pgBtn);

  let lastGroup = '';
  for (const s of scenarios) {
    if (s.group !== lastGroup) {
      const g = document.createElement('div');
      g.className = 'group-label';
      g.textContent = s.group;
      sidebar.appendChild(g);
      lastGroup = s.group;
    }
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (s.id === activeId ? ' active' : '');
    btn.textContent = s.title;
    btn.onclick = () => navigate(s.id);
    sidebar.appendChild(btn);
  }
  return sidebar;
}

// ---- Views -----------------------------------------------------------------

function renderOverview(main: HTMLElement): void {
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.innerHTML =
    '<h1 class="hero-title">Stunning charts from a single <span class="accent">JSON</span> spec.</h1>' +
    '<p class="hero-sub">A zero-dependency, agent-first visualization engine — Tableau-class visuals ' +
    'from declarative specs, rendered on a fast hybrid Canvas2D&nbsp;+&nbsp;DOM core.</p>' +
    '<div class="hero-chips">' +
    '<span class="chip">11 chart types</span>' +
    '<span class="chip">Zero dependencies</span>' +
    '<span class="chip">Light · Dark · Sketch</span>' +
    '<span class="chip">50k points, smooth</span>' +
    '<span class="chip">OKLab color</span>' +
    '</div>';
  main.appendChild(hero);

  const mosaic = document.createElement('div');
  mosaic.className = 'mosaic';
  main.appendChild(mosaic);

  for (const item of OVERVIEW) {
    const scenario = scenarioById(item.id);
    if (!scenario) continue;
    const card = document.createElement('button');
    card.className = 'ov-card' + (item.span ? ' span' : '');
    card.onclick = () => navigate(scenario.id);

    const head = document.createElement('div');
    head.className = 'ov-head';
    head.innerHTML =
      `<span class="ov-badge">${scenario.group}</span>` +
      `<span class="ov-title">${scenario.title}</span>` +
      '<span class="ov-open">Open ↗</span>';
    card.appendChild(head);

    const host = document.createElement('div');
    host.className = 'ov-chart';
    host.style.height = `${item.h}px`;
    card.appendChild(host);

    mosaic.appendChild(card);
    renderResponsive(host, scenario.spec());
  }

  const footer = document.createElement('footer');
  footer.className = 'foot';
  footer.innerHTML =
    'Every tile above is one <code>ChartSpec</code>. Pick a chart in the sidebar to see it large with its spec, ' +
    `or open the <a href="#${PLAYGROUND_ID}">Playground</a> to build your own.`;
  footer.querySelector('a')!.addEventListener('click', (e) => {
    e.preventDefault();
    navigate(PLAYGROUND_ID);
  });
  main.appendChild(footer);
}

/** A compact, readable JSON view of a spec: big data arrays + geo are elided. */
function summarizeSpec(spec: ChartSpec): string {
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

function renderDetail(main: HTMLElement, scenario: Scenario): void {
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML =
    `<div class="title-group"><h2>${scenario.title}</h2>` +
    `<p class="sub">${scenario.group} · live ${currentTheme}${currentSketch ? ' · sketch' : ''}</p></div>`;
  main.appendChild(toolbar);

  // Feature render — one large, responsive chart.
  const feature = document.createElement('div');
  feature.className = 'card feature-card';
  const featHost = document.createElement('div');
  featHost.className = 'feature-host';
  feature.appendChild(featHost);
  main.appendChild(feature);
  renderResponsive(featHost, scenario.spec());

  // Spec snippet — reinforce "one JSON = one chart".
  const specCard = document.createElement('div');
  specCard.className = 'card spec-card';
  const specHead = document.createElement('div');
  specHead.className = 'spec-head';
  specHead.innerHTML = '<span class="spec-title">ChartSpec</span>';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-ghost btn-sm';
  copyBtn.textContent = 'Copy';
  const specText = summarizeSpec(scenario.spec());
  copyBtn.onclick = () => {
    void navigator.clipboard?.writeText(specText);
    copyBtn.textContent = 'Copied';
    window.setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
  };
  specHead.appendChild(copyBtn);
  const pre = document.createElement('pre');
  pre.className = 'spec-pre';
  pre.textContent = specText;
  specCard.append(specHead, pre);
  main.appendChild(specCard);

  // Responsive strip — same spec, several sizes (skip Large; the feature is large).
  const stripLabel = document.createElement('div');
  stripLabel.className = 'section-label';
  stripLabel.textContent = 'Responsive — same spec, different sizes';
  main.appendChild(stripLabel);

  const grid = document.createElement('div');
  grid.className = 'grid';
  main.appendChild(grid);

  for (const size of SIZES.filter((s) => s.name !== 'Large')) {
    const card = document.createElement('div');
    card.className = 'card';
    const label = document.createElement('div');
    label.className = 'size-label';
    label.textContent = `${size.name} · ${size.w}×${size.h}`;
    card.appendChild(label);
    const host = document.createElement('div');
    host.className = 'chart-host';
    host.style.width = `${size.w}px`;
    host.style.height = `${size.h}px`;
    card.appendChild(host);
    grid.appendChild(card);
    try {
      instances.push(
        render(host, withSize(scenario.spec(), size.w, size.h, currentTheme, currentSketch)),
      );
    } catch (err) {
      host.textContent = String(err);
    }
  }
}

function renderGallery(): void {
  clearInstances();
  document.documentElement.classList.toggle('theme-dark', currentTheme === 'dark');
  app.innerHTML = '';
  app.appendChild(buildTopbar());

  const shell = document.createElement('div');
  shell.className = 'shell';
  app.appendChild(shell);
  shell.appendChild(buildSidebar());

  const main = document.createElement('main');
  main.className = 'main';
  shell.appendChild(main);

  if (activeId === PLAYGROUND_ID) {
    playground = mountPlayground(main, { theme: currentTheme });
    return;
  }
  if (activeId === OVERVIEW_ID) {
    renderOverview(main);
    return;
  }
  renderDetail(main, scenarioById(activeId) ?? scenarios[0]);
}

if (params.has('shot')) {
  void renderShot();
} else {
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1) || OVERVIEW_ID;
    if (id !== activeId && (id === PLAYGROUND_ID || id === OVERVIEW_ID || scenarioById(id))) {
      activeId = id;
      renderGallery();
    }
  });
  renderGallery();
}

export type { Scenario };
