import { render, renderDashboard, type ChartSpec, type DashboardSpec } from 'graphein';
import { applyChartTheme } from './lib/chart';
import { buildShotRegistry, shotSpec } from './lib/shot-registry';
import type { ThemeName } from './state/theme';

declare global {
  interface Window {
    __grapheinChart?: unknown;
    __grapheinDashboard?: unknown;
    __grapheinShotIds?: string[];
  }
}

/**
 * Deterministic, chrome-free mount for `?shot=<id>` — used by the visual-test
 * harness (`tests/visual/*.mjs`). Sizes a single host to w×h, applies the
 * requested theme/sketch, disables animation, mounts the chart/dashboard,
 * exposes it on `window.__grapheinChart` / `__grapheinDashboard`, and flips
 * `data-shot-ready` once fonts have settled so screenshots are stable.
 */
export async function mountShot(root: HTMLElement, params: URLSearchParams): Promise<void> {
  const id = params.get('shot') ?? '';
  const w = Number(params.get('w') ?? 720);
  const h = Number(params.get('h') ?? 440);
  const theme = (params.get('theme') as ThemeName) === 'dark' ? 'dark' : 'light';
  const sketch = params.get('sketch') === '1' || params.get('sketch') === 'true';

  root.classList.add('shot-root');
  window.__grapheinShotIds = [...buildShotRegistry().keys()];
  document.documentElement.classList.toggle('theme-dark', theme === 'dark');
  document.body.style.margin = '0';
  document.body.style.background = 'var(--bg)';

  const entry = shotSpec(id);
  const host = document.createElement('div');
  host.style.width = `${w}px`;
  host.style.height = `${h}px`;
  root.innerHTML = '';
  root.appendChild(host);

  if (!entry) {
    host.textContent = `Unknown shot: ${id}`;
    document.body.setAttribute('data-shot-ready', 'error');
    return;
  }

  const base = applyChartTheme(entry.spec, theme, sketch) as ChartSpec | DashboardSpec;
  const spec = { ...(base as unknown as Record<string, unknown>), animation: false } as unknown as
    | ChartSpec
    | DashboardSpec;

  if (entry.kind === 'dashboard') {
    window.__grapheinDashboard = renderDashboard(host, spec as DashboardSpec);
  } else {
    window.__grapheinChart = render(host, spec as ChartSpec);
  }

  try {
    await document.fonts.ready;
  } catch {
    /* fonts API unavailable — proceed */
  }
  requestAnimationFrame(() => {
    document.body.setAttribute('data-shot-ready', 'true');
  });
}
