import './style.css';
import { render, type ChartSpec, type ChartInstance } from '@envy/core';
import { scenarios, scenarioById, type Scenario } from './scenarios';

const SIZES = [
  { name: 'Small', w: 360, h: 240 },
  { name: 'Medium', w: 580, h: 360 },
  { name: 'Large', w: 860, h: 480 },
  { name: 'Wide', w: 980, h: 300 },
  { name: 'Tall', w: 440, h: 560 },
];

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

function withSize(spec: ChartSpec, w: number, h: number, theme?: string): ChartSpec {
  return { ...spec, dimensions: { width: w, height: h }, theme: theme ?? spec.theme } as ChartSpec;
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
  const scenario = scenarioById(id);
  const root = document.createElement('div');
  root.className = 'shot-root' + (theme === 'dark' ? ' theme-dark-bg' : '');
  document.body.appendChild(root);

  const host = document.createElement('div');
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  root.appendChild(host);

  if (scenario) {
    const instance = render(host, withSize(scenario.spec(), w, h, theme));
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
let activeId = location.hash.slice(1) || scenarios[0].id;
const instances: ChartInstance[] = [];

function clearInstances(): void {
  for (const i of instances) i.destroy();
  instances.length = 0;
}

function renderGallery(): void {
  document.documentElement.classList.toggle('theme-dark', currentTheme === 'dark');
  app.innerHTML = '';

  // Sidebar
  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';
  sidebar.innerHTML = `<h1>Envy</h1><p class="tagline">agent-first data visualization</p>`;
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
    btn.onclick = () => {
      activeId = s.id;
      location.hash = s.id;
      renderGallery();
    };
    sidebar.appendChild(btn);
  }
  app.appendChild(sidebar);

  // Main
  const main = document.createElement('main');
  main.className = 'main';
  const scenario = scenarioById(activeId) ?? scenarios[0];

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `<h2>${scenario.title}</h2><div class="spacer"></div>`;
  const themeBtn = document.createElement('button');
  themeBtn.className = 'btn';
  themeBtn.textContent = currentTheme === 'dark' ? '☀ Light' : '☾ Dark';
  themeBtn.onclick = () => {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    renderGallery();
  };
  toolbar.appendChild(themeBtn);
  main.appendChild(toolbar);

  const grid = document.createElement('div');
  grid.className = 'grid';
  main.appendChild(grid);
  app.appendChild(main);

  clearInstances();
  for (const size of SIZES) {
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
      instances.push(render(host, withSize(scenario.spec(), size.w, size.h, currentTheme)));
    } catch (err) {
      host.textContent = String(err);
    }
  }
}

if (params.has('shot')) {
  void renderShot();
} else {
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (id && id !== activeId && scenarioById(id)) {
      activeId = id;
      renderGallery();
    }
  });
  renderGallery();
}

export type { Scenario };
