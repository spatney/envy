import './style.css';
import {
  render,
  renderDashboard,
  type ChartSpec,
  type ChartInstance,
  type DashboardInstance,
  type DashboardSpec,
} from 'graphein';
import { scenarios, scenarioById, type Scenario } from './scenarios';
import { mountPlayground, loadIntoPlayground, type PlaygroundHandle } from './playground';
import { dashboardDemo } from './interactive';
import {
  renderHome,
  renderGalleryView,
  renderDetail,
  renderDashboardView,
  renderLearn,
  type GalleryCtx,
} from './views';

const DASHBOARD_ID = '__dashboard__';
const REPO_URL = 'https://github.com/spatney/graphein';

/** Inline brand mark — the Graphein "g" with its 4-node color ramp.
 *  The stroke uses currentColor so the mark adapts to the light/dark nav. */
const GRAPHEIN_MARK_SVG =
  '<svg viewBox="0 0 116.85 116.85" aria-hidden="true" focusable="false">' +
  '<g transform="translate(18.618,2.609)">' +
  '<path d="M61,29 A23,23 0 1 0 61,53 C61,68 62,82 56,89 C51,95 38,95 30,90" fill="none" stroke="currentColor" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<circle cx="61.00" cy="29.00" r="6.9" fill="#4F46E5"/>' +
  '<circle cx="18.57" cy="43.97" r="6.9" fill="#1E88E5"/>' +
  '<circle cx="61.04" cy="60.15" r="6.9" fill="#06B6D4"/>' +
  '<circle cx="30.00" cy="90.00" r="6.9" fill="#10B981"/>' +
  '</g></svg>';

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

/** Deterministic single-chart route for Playwright: ?shot=<id>&w=&h=&theme= */
async function renderShot(): Promise<void> {
  // Entrance animations would make screenshots non-deterministic; disable them
  // for the shot route by default (a test can opt in by pre-setting the flag).
  {
    const g = window as unknown as { __GRAPHEIN_DISABLE_ANIM?: boolean };
    if (g.__GRAPHEIN_DISABLE_ANIM === undefined) g.__GRAPHEIN_DISABLE_ANIM = true;
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

  if (id === DASHBOARD_ID) {
    host.style.height = 'auto';
    const dash = renderDashboard(host, { ...dashboardDemo(), theme: theme as 'light' | 'dark' });
    (window as unknown as { __grapheinDashboard?: DashboardInstance }).__grapheinDashboard = dash;
  } else if (scenario) {
    const instance = render(host, withSize(scenario.spec(), w, h, theme, sketch));
    // Expose the instance so update()-transition tests can drive it.
    (window as unknown as { __grapheinChart?: ChartInstance }).__grapheinChart = instance;
  } else {
    host.textContent = `Unknown scenario: ${id}`;
  }

  // Web fonts load lazily on first text measurement, so the meaningful wait is
  // *after* render() has requested them. The runtime also re-lays-out on
  // fonts.ready, so by the time this resolves the final frame uses real metrics.
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;

  document.documentElement.setAttribute('data-shot-ready', 'true');
}

// ===========================================================================
// Live app shell — built ONCE; only `.content` is swapped per route.
// ===========================================================================

let currentTheme: 'light' | 'dark' = (params.get('theme') as 'light' | 'dark') ?? 'light';
let currentSketch = params.get('sketch') === '1' || params.get('sketch') === 'true';
const reducedMotion =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// Per-view instance/teardown tracking for the CURRENT content view.
const instances: ChartInstance[] = [];
let dashboardInstance: DashboardInstance | undefined;
let playground: PlaygroundHandle | undefined;
let resizeObs: ResizeObserver | undefined;
const resizeMap = new Map<Element, ChartInstance>();
const disposers: (() => void)[] = [];

// Shell elements (assigned once in buildShell).
let scrollEl!: HTMLElement;
let content!: HTMLElement;
let themeBtn!: HTMLButtonElement;
let sketchBtn!: HTMLButtonElement;
const navLinks = new Map<string, HTMLButtonElement>();

// Scroll memory: restore where you were when returning to a route.
const scrollMemory = new Map<string, number>();
let currentRouteKey = '';

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

// ---- Routing ---------------------------------------------------------------

type RouteView = 'home' | 'gallery' | 'learn' | 'dashboard' | 'playground' | 'chart';
interface Route {
  view: RouteView;
  id?: string;
}

/** Parse the hash into a route, honoring legacy `__overview__/__dashboard__/__playground__`
 *  and bare-id aliases so old deep-links keep working. */
function parseHash(): Route {
  const raw = decodeURIComponent(location.hash.slice(1));
  if (!raw || raw === 'home' || raw === '__overview__') return { view: 'home' };
  if (raw === 'gallery') return { view: 'gallery' };
  if (raw === 'learn') return { view: 'learn' };
  if (raw === 'dashboard' || raw === '__dashboard__') return { view: 'dashboard' };
  if (raw === 'playground' || raw === '__playground__') return { view: 'playground' };
  if (raw.startsWith('chart/')) {
    const id = raw.slice('chart/'.length);
    if (scenarioById(id)) return { view: 'chart', id };
  }
  if (scenarioById(raw)) return { view: 'chart', id: raw };
  return { view: 'home' };
}

function routeKey(r: Route): string {
  return r.view === 'chart' ? `chart/${r.id}` : r.view;
}

// ---- Instance lifecycle ----------------------------------------------------

function clearContent(): void {
  for (const d of disposers.splice(0)) {
    try {
      d();
    } catch {
      /* ignore */
    }
  }
  playground?.dispose();
  playground = undefined;
  try {
    dashboardInstance?.destroy();
  } catch {
    /* ignore */
  }
  dashboardInstance = undefined;
  resizeObs?.disconnect();
  resizeObs = undefined;
  resizeMap.clear();
  for (const i of instances) {
    try {
      i.destroy();
    } catch {
      /* ignore */
    }
  }
  instances.length = 0;
}

/** Apply the live theme + sketch but leave sizing to the container (responsive). */
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

function mountChart(host: HTMLElement, spec: ChartSpec): void {
  try {
    const inst = render(host, themed(spec));
    instances.push(inst);
    resizeMap.set(host, inst);
    resizeObs ??= new ResizeObserver((entries) => {
      for (const e of entries) {
        try {
          resizeMap.get(e.target)?.resize();
        } catch {
          /* host detached */
        }
      }
    });
    resizeObs.observe(host);
  } catch (err) {
    host.textContent = String(err);
  }
}

function mountDashboard(host: HTMLElement, spec: DashboardSpec): void {
  try {
    dashboardInstance = renderDashboard(host, { ...spec, theme: currentTheme } as DashboardSpec);
  } catch (err) {
    host.textContent = String(err);
  }
}

function makeCtx(): GalleryCtx {
  return {
    theme: currentTheme,
    sketch: currentSketch,
    reducedMotion,
    navigate,
    themed,
    mountChart,
    mountDashboard,
    addDisposer: (fn) => disposers.push(fn),
    openInPlayground: (spec) => {
      loadIntoPlayground(spec);
      navigate('playground');
    },
  };
}

// ---- Navigation + render ---------------------------------------------------

function navigate(hash: string): void {
  const target = hash || 'home';
  if (location.hash.slice(1) === target) {
    renderRoute(false);
    return;
  }
  location.hash = target; // triggers hashchange → renderRoute
}

function setActiveNav(view: RouteView): void {
  const key = view === 'chart' ? 'gallery' : view;
  for (const [k, btn] of navLinks) btn.classList.toggle('active', k === key);
}

function renderRoute(preserveScroll: boolean): void {
  const route = parseHash();
  const key = routeKey(route);
  const targetScroll = preserveScroll ? scrollEl.scrollTop : scrollMemory.get(key) ?? 0;

  clearContent();
  content.innerHTML = '';
  setActiveNav(route.view);
  const ctx = makeCtx();

  switch (route.view) {
    case 'home':
      renderHome(content, ctx);
      break;
    case 'gallery':
      renderGalleryView(content, ctx);
      break;
    case 'learn':
      renderLearn(content, ctx);
      break;
    case 'dashboard':
      renderDashboardView(content, ctx);
      break;
    case 'playground': {
      const wrap = el('div', 'page');
      content.appendChild(wrap);
      playground = mountPlayground(wrap, { theme: currentTheme });
      break;
    }
    case 'chart': {
      const scenario = scenarioById(route.id!) ?? scenarios[0];
      renderDetail(content, scenario, ctx);
      break;
    }
  }

  scrollEl.scrollTop = targetScroll;
  currentRouteKey = key;
}

// ---- Chrome (built once) ---------------------------------------------------

function buildShell(): void {
  app.innerHTML = '';

  const nav = el('header', 'nav');
  const inner = el('div', 'nav-inner');

  const brand = el('button', 'brand');
  brand.innerHTML = `<span class="brand-mark">${GRAPHEIN_MARK_SVG}</span><span class="brand-name">Graphein</span>`;
  brand.title = 'Home';
  brand.onclick = () => navigate('home');
  inner.appendChild(brand);

  const links = el('nav', 'nav-links');
  const NAV: [string, string][] = [
    ['home', 'Home'],
    ['gallery', 'Gallery'],
    ['dashboard', 'Dashboard'],
    ['playground', 'Playground'],
    ['learn', 'Learn'],
  ];
  for (const [key, label] of NAV) {
    const btn = el('button', 'nav-link');
    btn.textContent = label;
    btn.onclick = () => navigate(key);
    navLinks.set(key, btn);
    links.appendChild(btn);
  }
  inner.appendChild(links);

  const actions = el('div', 'nav-actions');

  sketchBtn = el('button', 'icon-btn' + (currentSketch ? ' active' : ''));
  sketchBtn.textContent = '✏';
  sketchBtn.title = currentSketch ? 'Sketch mode: on' : 'Sketch mode: off';
  sketchBtn.onclick = toggleSketch;
  actions.appendChild(sketchBtn);

  themeBtn = el('button', 'icon-btn');
  themeBtn.textContent = currentTheme === 'dark' ? '☀' : '☾';
  themeBtn.title = currentTheme === 'dark' ? 'Switch to light' : 'Switch to dark';
  themeBtn.onclick = toggleTheme;
  actions.appendChild(themeBtn);

  const gh = el('a', 'btn btn-sm');
  (gh as HTMLAnchorElement).href = REPO_URL;
  (gh as HTMLAnchorElement).target = '_blank';
  (gh as HTMLAnchorElement).rel = 'noreferrer';
  gh.textContent = 'GitHub ↗';
  actions.appendChild(gh);

  inner.appendChild(actions);
  nav.appendChild(inner);
  app.appendChild(nav);

  scrollEl = el('div', 'scroll');
  content = el('main', 'content');
  scrollEl.appendChild(content);
  app.appendChild(scrollEl);
}

function toggleTheme(): void {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.classList.toggle('theme-dark', currentTheme === 'dark');
  themeBtn.textContent = currentTheme === 'dark' ? '☀' : '☾';
  themeBtn.title = currentTheme === 'dark' ? 'Switch to light' : 'Switch to dark';
  renderRoute(true);
}

function toggleSketch(): void {
  currentSketch = !currentSketch;
  sketchBtn.classList.toggle('active', currentSketch);
  sketchBtn.title = currentSketch ? 'Sketch mode: on' : 'Sketch mode: off';
  renderRoute(true);
}

// ---- Boot ------------------------------------------------------------------

if (params.has('shot')) {
  void renderShot();
} else {
  document.documentElement.classList.toggle('theme-dark', currentTheme === 'dark');
  buildShell();
  window.addEventListener('hashchange', () => {
    scrollMemory.set(currentRouteKey, scrollEl.scrollTop);
    renderRoute(false);
  });
  renderRoute(false);
}

export type { Scenario };
