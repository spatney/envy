/**
 * Dashboard runtime — `renderDashboard(container, spec)`.
 *
 * Lays views out on responsive CSS grids, shares one {@link SelectionStore}
 * across them, and auto-wires cross-interaction (slicers filter charts; chart
 * clicks cross-highlight charts that share the field). Each view is mounted with
 * the same `render()` used for standalone charts — the dashboard is mostly a
 * spec rewriter (see {@link wireViews}) plus layout and a shared bus, so all of
 * Phase 1's filter/highlight machinery is reused unchanged.
 */

import type { ChartSpec } from '../spec/types';
import type { DashboardLayout, DashboardSection, DashboardSpec, DashboardView } from '../spec/dashboard';
import type { SelectionValue } from '../spec/selection';
import { resolveTheme, type ThemeTokens } from '../theme';
import { createSelectionStore, type SelectionStore } from '../interaction/store';
import { render, type ChartInstance, type SelectionChangeListener } from './render';
import { wireViews, isSlicerType } from './wire';

export interface RenderDashboardOptions {
  /** Share a bus with charts/dashboards outside this one. */
  store?: SelectionStore;
}

export interface DashboardInstance {
  /** Re-render with a new dashboard spec (keeps the shared store/selection). */
  update(spec: DashboardSpec): void;
  /** Re-measure every view. */
  resize(): void;
  /** Tear down all views, observers, and listeners. */
  destroy(): void;
  /** The currently rendered dashboard spec. */
  readonly spec: DashboardSpec;
  /** The shared selection bus driving cross-interaction. */
  readonly store: SelectionStore;
  /** The mounted chart instances, in view order. */
  readonly views: ChartInstance[];
  getSelection(name?: string): SelectionValue | null | Record<string, SelectionValue | null>;
  setSelection(name: string, value: SelectionValue | null): void;
  clearSelection(name?: string): void;
  on(event: 'selectionchange', listener: SelectionChangeListener): () => void;
  off(event: 'selectionchange', listener: SelectionChangeListener): void;
}

const DEFAULTS = { cols: 12, rowHeight: 96, gap: 14 } as const;
const DENSITY: Record<NonNullable<DashboardLayout['density']>, { rowHeight: number; gap: number }> = {
  compact: { rowHeight: 80, gap: 10 },
  standard: { rowHeight: DEFAULTS.rowHeight, gap: DEFAULTS.gap },
  comfortable: { rowHeight: 116, gap: 18 },
};
const DEFAULT_BREAKPOINTS: { maxWidth: number; cols: number }[] = [
  { maxWidth: 600, cols: 1 },
  { maxWidth: 960, cols: 6 },
];
/** Compact slicers that belong in the top navigator strip (lists stay in the grid). */
const STRIP_SLICERS = new Set(['dropdown', 'search', 'dateRange', 'range']);

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

type ResolvedLayout = Required<Pick<DashboardLayout, 'cols' | 'rowHeight' | 'gap'>> &
  Pick<DashboardLayout, 'breakpoints' | 'navigators' | 'sections' | 'preset' | 'maxWidth' | 'density' | 'padding'>;
type WiredView = DashboardView & { spec: ChartSpec };
export type DashboardCell = {
  el: HTMLElement;
  view: WiredView;
  x?: number;
  y?: number;
  w: number;
  h: number;
  baseCols: number;
};
type Cell = DashboardCell;
export type { WiredView };
type SectionPlan = {
  section?: DashboardSection;
  views: WiredView[];
  cols: number;
  rowHeight: number;
  collapsed: boolean;
  explicit: boolean;
};

/** Default column/row span for a view, by type (at full column count). */
export function defaultSpan(spec: ChartSpec, cols: number): { w: number; h: number } {
  const t = spec.type;
  if (isSlicerType(t)) return { w: Math.min(3, cols), h: 2 };
  if (t === 'kpi') return { w: Math.min(3, cols), h: 2 };
  if (t === 'table' || t === 'matrix') return { w: cols, h: 4 };
  if (t === 'funnel' || t === 'pie') return { w: Math.min(4, cols), h: 4 };
  return { w: Math.min(6, cols), h: 4 };
}

export function resolveDashboardLayout(layout?: DashboardLayout): ResolvedLayout {
  const density = layout?.density ?? 'standard';
  const dense = DENSITY[density];
  return {
    cols: layout?.cols ?? DEFAULTS.cols,
    rowHeight: layout?.rowHeight ?? dense.rowHeight,
    gap: layout?.gap ?? dense.gap,
    breakpoints: layout?.breakpoints,
    navigators: layout?.navigators,
    sections: layout?.sections,
    preset: layout?.preset,
    maxWidth: layout?.maxWidth,
    density: layout?.density,
    padding: layout?.padding,
  };
}

function resolveContainer(target: HTMLElement | string): HTMLElement {
  if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (!el) throw new Error(`Graphein: no element matches selector "${target}"`);
    return el as HTMLElement;
  }
  return target;
}

/** Inherit the dashboard's data/theme/background onto a (wired) view spec. */
export function inheritInto(spec: ChartSpec, dash: DashboardSpec, tokens: ThemeTokens, suppressTitle = false): ChartSpec {
  const next = { ...spec } as ChartSpec & { data?: unknown; theme?: unknown; background?: string; title?: unknown };
  if (next.data == null && dash.data) next.data = dash.data;
  next.theme = spec.theme ?? dash.theme;
  if (next.background == null) next.background = tokens.color.surface;
  if (suppressTitle) delete next.title;
  return next as ChartSpec;
}

function hasExplicitPlacement(view: DashboardView): boolean {
  return view.x != null || view.y != null || view.w != null || view.h != null;
}

export function placeViews(views: WiredView[], cols: number, preset: DashboardLayout['preset']): Cell[] {
  if (!preset || preset === 'auto') {
    return views.map((view) => {
      const span = defaultSpan(view.spec, cols);
      return { el: undefined as unknown as HTMLElement, view, x: view.x, y: view.y, w: view.w ?? span.w, h: view.h ?? span.h, baseCols: cols };
    });
  }

  const cells: Cell[] = [];
  const cursor = { x: 1, y: 1, rowH: 0 };
  const pack = (view: WiredView, forced?: { x?: number; y?: number; w?: number; h?: number }): Cell => {
    const span = defaultSpan(view.spec, cols);
    const w = forced?.w ?? view.w ?? span.w;
    const h = forced?.h ?? view.h ?? span.h;
    if (forced?.x != null || forced?.y != null || view.x != null || view.y != null) {
      return { el: undefined as unknown as HTMLElement, view, x: forced?.x ?? view.x, y: forced?.y ?? view.y, w, h, baseCols: cols };
    }
    if (cursor.x + w - 1 > cols) {
      cursor.x = 1;
      cursor.y += Math.max(1, cursor.rowH);
      cursor.rowH = 0;
    }
    const cell = { el: undefined as unknown as HTMLElement, view, x: cursor.x, y: cursor.y, w, h, baseCols: cols };
    cursor.x += w;
    cursor.rowH = Math.max(cursor.rowH, h);
    return cell;
  };

  const explicit = views.filter(hasExplicitPlacement);
  const unplaced = views.filter((v) => !hasExplicitPlacement(v));
  for (const view of explicit) cells.push(pack(view));

  if (preset === 'kpi-first') {
    const ordered = [...unplaced].sort((a, b) => (b.spec.type === 'kpi' ? 1 : 0) - (a.spec.type === 'kpi' ? 1 : 0));
    for (const view of ordered) cells.push(pack(view));
  } else {
    const sidebar = unplaced.filter((v) => isSlicerType(v.spec.type) || v.spec.type === 'table' || v.spec.type === 'matrix');
    const content = unplaced.filter((v) => !sidebar.includes(v));
    const sideW = Math.min(3, cols);
    let sideY = 1;
    let contentY = 1;
    for (const view of sidebar) {
      const span = defaultSpan(view.spec, cols);
      const h = view.h ?? span.h;
      cells.push(pack(view, { x: 1, y: sideY, w: view.w ?? sideW, h }));
      sideY += h;
    }
    for (const view of content) {
      const span = defaultSpan(view.spec, cols);
      const h = view.h ?? span.h;
      cells.push(pack(view, { x: sideW + 1, y: contentY, w: view.w ?? Math.max(1, cols - sideW), h }));
      contentY += h;
    }
  }

  return cells.sort((a, b) => views.indexOf(a.view) - views.indexOf(b.view));
}

export function resolveDashboardSections(
  views: WiredView[],
  layout: Pick<ResolvedLayout, 'cols' | 'rowHeight' | 'sections'>,
): SectionPlan[] {
  if (!layout.sections?.length) {
    return [{ views, cols: Math.max(1, layout.cols), rowHeight: Math.max(1, layout.rowHeight), collapsed: false, explicit: false }];
  }
  const byId = new Map(views.map((v) => [v.id, v]));
  const used = new Set<string>();
  const plans: SectionPlan[] = [];
  for (const section of layout.sections) {
    const sectionViews = section.views.map((id) => byId.get(id)).filter((v): v is WiredView => !!v && !used.has(v.id));
    sectionViews.forEach((v) => used.add(v.id));
    plans.push({
      section,
      views: sectionViews,
      cols: Math.max(1, section.cols ?? layout.cols),
      rowHeight: Math.max(1, section.rowHeight ?? layout.rowHeight),
      collapsed: section.collapsed === true,
      explicit: true,
    });
  }
  const trailing = views.filter((v) => !used.has(v.id));
  if (trailing.length) {
    plans.push({ views: trailing, cols: Math.max(1, layout.cols), rowHeight: Math.max(1, layout.rowHeight), collapsed: false, explicit: true });
  }
  return plans;
}

function matchingResponsive(view: DashboardView, width: number): NonNullable<DashboardView['responsive']>[number] | undefined {
  return view.responsive
    ?.filter((r) => width <= r.maxWidth)
    .sort((a, b) => a.maxWidth - b.maxWidth)[0];
}

export function renderDashboard(
  target: HTMLElement | string,
  spec: DashboardSpec,
  options?: RenderDashboardOptions,
): DashboardInstance {
  const container = resolveContainer(target);
  const store = options?.store ?? createSelectionStore();

  let currentSpec = spec;
  const instances: ChartInstance[] = [];
  const hostListeners = new Set<SelectionChangeListener>();
  let root: HTMLElement | undefined;
  let resizeObs: ResizeObserver | undefined;
  let destroyed = false;

  const build = (): void => {
    const tokens = resolveTheme(currentSpec.theme);
    const layout = resolveDashboardLayout(currentSpec.layout);
    const baseCols = Math.max(1, layout.cols);
    const breakpoints = (layout.breakpoints ?? DEFAULT_BREAKPOINTS).slice().sort((a, b) => a.maxWidth - b.maxWidth);
    const navMode = layout.navigators ?? 'top';
    const pagePadding = layout.padding ?? Math.round(layout.gap * 1.4);

    // Seed dashboard-level initial param values (without clobbering live ones).
    for (const param of currentSpec.params ?? []) {
      if (param.value !== undefined && store.get(param.name) == null) {
        store.set(param.name, param.value ?? null);
      }
    }

    root = document.createElement('div');
    root.className = 'graphein-dashboard';
    Object.assign(root.style, {
      boxSizing: 'border-box',
      width: currentSpec.dimensions?.width ? `${currentSpec.dimensions.width}px` : '100%',
      maxWidth: layout.maxWidth ? `${layout.maxWidth}px` : '',
      margin: layout.maxWidth ? '0 auto' : '',
      background: currentSpec.background ?? tokens.color.background,
      color: tokens.color.text,
      fontFamily: tokens.font.family,
      padding: `${pagePadding}px`,
      display: 'flex',
      flexDirection: 'column',
      gap: `${layout.gap}px`,
    } as Partial<CSSStyleDeclaration>);

    // ---- Header: accent rule + title + subtitle ----------------------------
    const titleText =
      typeof currentSpec.title === 'string' ? currentSpec.title : currentSpec.title?.text;
    if (titleText || currentSpec.subtitle) {
      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex',
        alignItems: 'center',
        gap: `${tokens.spacing.md}px`,
        padding: `0 ${tokens.spacing.xs}px`,
      } as Partial<CSSStyleDeclaration>);

      const accent = document.createElement('div');
      Object.assign(accent.style, {
        flex: '0 0 auto',
        width: '5px',
        alignSelf: 'stretch',
        minHeight: '34px',
        borderRadius: '3px',
        background: tokens.color.accent,
      } as Partial<CSSStyleDeclaration>);
      header.appendChild(accent);

      const titles = document.createElement('div');
      Object.assign(titles.style, { display: 'flex', flexDirection: 'column', gap: '3px' } as Partial<CSSStyleDeclaration>);
      if (titleText) {
        const h = document.createElement('div');
        h.textContent = titleText;
        Object.assign(h.style, {
          font: `${tokens.font.weight.bold} ${tokens.font.size.title}px ${tokens.font.family}`,
          color: tokens.color.text,
          letterSpacing: '-0.01em',
          lineHeight: '1.15',
        } as Partial<CSSStyleDeclaration>);
        titles.appendChild(h);
      }
      if (currentSpec.subtitle) {
        const sub = document.createElement('div');
        sub.textContent = currentSpec.subtitle;
        Object.assign(sub.style, {
          font: `${tokens.font.weight.normal} ${tokens.font.size.small}px ${tokens.font.family}`,
          color: tokens.color.textMuted,
        } as Partial<CSSStyleDeclaration>);
        titles.appendChild(sub);
      }
      header.appendChild(titles);
      root.appendChild(header);
    }

    const wired = wireViews(currentSpec.views as DashboardView[], currentSpec.interactions ?? 'auto') as WiredView[];

    // ---- Partition: top-strip navigators vs grid views ---------------------
    const sectionedIds = new Set((layout.sections ?? []).flatMap((section) => section.views));
    const stripViews =
      navMode === 'top'
        ? wired.filter((v) => STRIP_SLICERS.has(v.spec.type) && v.x == null && v.y == null && !sectionedIds.has(v.id))
        : [];
    const stripIds = new Set(stripViews.map((v) => v.id));
    const gridViews = wired.filter((v) => !stripIds.has(v.id));

    const mount = (host: HTMLElement, view: WiredView): void => {
      const finalSpec = inheritInto(view.spec, currentSpec, tokens, !!(view.title || view.subtitle));
      try {
        instances.push(render(host, finalSpec, { store, frame: view.frame ?? true }));
      } catch (err) {
        host.textContent = String(err);
      }
    };

    const cellChrome = (cell: HTMLElement, view?: DashboardView): void => {
      const framed = view?.frame ?? true;
      Object.assign(cell.style, {
        minWidth: '0',
        minHeight: '0',
        overflow: 'hidden',
        position: 'relative',
        boxSizing: 'border-box',
        borderRadius: framed ? `${tokens.radius.lg}px` : '0',
        border: framed ? `1px solid ${tokens.color.border}` : '0',
        background: view?.background ?? (framed ? tokens.color.surface : 'transparent'),
      } as Partial<CSSStyleDeclaration>);
    };

    const createCard = (view: WiredView): { cell: HTMLElement; host: HTMLElement } => {
      const cell = document.createElement('div');
      cellChrome(cell, view);
      cell.setAttribute('data-view-id', view.id);
      const hasCardChrome =
        !!(view.title || view.subtitle || view.accent || view.background || view.frame === false || view.padding === 'none');
      if (!hasCardChrome) return { cell, host: cell };

      Object.assign(cell.style, { display: 'flex', flexDirection: 'column' } as Partial<CSSStyleDeclaration>);
      // Remember the intended display so the responsive pass in applyLayout can
      // restore it after toggling visibility (it must not clobber `flex`).
      cell.dataset.cardDisplay = 'flex';
      if (view.accent) {
        const accent = document.createElement('div');
        Object.assign(accent.style, {
          position: 'absolute',
          left: '0',
          top: '0',
          bottom: '0',
          width: '5px',
          background: view.accent,
          pointerEvents: 'none',
        } as Partial<CSSStyleDeclaration>);
        cell.appendChild(accent);
      }

      const inset = view.padding === 'none' ? 0 : tokens.spacing.sm;
      if (view.title || view.subtitle) {
        const header = document.createElement('div');
        Object.assign(header.style, {
          flex: '0 0 auto',
          padding: `${tokens.spacing.sm}px ${tokens.spacing.md}px ${tokens.spacing.xs}px ${tokens.spacing.md}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        } as Partial<CSSStyleDeclaration>);
        if (view.title) {
          const title = document.createElement('div');
          title.textContent = view.title;
          Object.assign(title.style, {
            font: `${tokens.font.weight.bold} ${tokens.font.size.base}px ${tokens.font.family}`,
            color: tokens.color.text,
            letterSpacing: '-0.01em',
          } as Partial<CSSStyleDeclaration>);
          header.appendChild(title);
        }
        if (view.subtitle) {
          const subtitle = document.createElement('div');
          subtitle.textContent = view.subtitle;
          Object.assign(subtitle.style, {
            font: `${tokens.font.weight.normal} ${tokens.font.size.small}px ${tokens.font.family}`,
            color: tokens.color.textMuted,
          } as Partial<CSSStyleDeclaration>);
          header.appendChild(subtitle);
        }
        cell.appendChild(header);
      }
      const host = document.createElement('div');
      Object.assign(host.style, {
        flex: '1 1 auto',
        minWidth: '0',
        minHeight: '0',
        padding: `${inset}px`,
        boxSizing: 'border-box',
      } as Partial<CSSStyleDeclaration>);
      cell.appendChild(host);
      return { cell, host };
    };

    const sectionPlans = resolveDashboardSections(gridViews, layout);
    const layoutGroups: { grid: HTMLElement; cells: Cell[]; baseCols: number }[] = [];

    // Views are mounted via `render()`, which measures the host to size its
    // canvas/overlay. A host that is still detached measures 0 and falls back to
    // a 640px default — and because ResizeObserver delivers no initial callback
    // for a detached element, the corrective post-attach resize is skipped, so
    // the view stays at 640px (overflowing/clipping its cell — most visibly a
    // slicer whose right handle is clipped). So we build the skeleton first and
    // defer every mount until after the root is in the document.
    const deferredMounts: { el: HTMLElement; view: WiredView; mounted: boolean }[] = [];

    // ---- Navigator strip ---------------------------------------------------
    if (stripViews.length) {
      const strip = document.createElement('div');
      Object.assign(strip.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: `${layout.gap}px`,
      } as Partial<CSSStyleDeclaration>);
      for (const view of stripViews) {
        const { cell, host } = createCard(view);
        Object.assign(cell.style, {
          flex: '1 1 220px',
          minWidth: '200px',
          height: `${Math.max(96, layout.rowHeight + 8)}px`,
        } as Partial<CSSStyleDeclaration>);
        strip.appendChild(cell);
        deferredMounts.push({ el: host, view, mounted: false });
      }
      root.appendChild(strip);
    }

    // ---- Responsive tile grids / optional sections -------------------------
    for (const plan of sectionPlans) {
      let parent: HTMLElement = root;
      let body: HTMLElement | undefined;
      if (plan.explicit) {
        const section = document.createElement('section');
        section.className = 'graphein-dashboard-section';
        if (plan.section?.id) section.setAttribute('data-section-id', plan.section.id);
        Object.assign(section.style, {
          display: 'flex',
          flexDirection: 'column',
          gap: `${layout.gap}px`,
        } as Partial<CSSStyleDeclaration>);

        const header = document.createElement('button');
        header.type = 'button';
        Object.assign(header.style, {
          appearance: 'none',
          border: '0',
          borderBottom: `1px solid ${tokens.color.border}`,
          background: plan.section?.background ?? 'transparent',
          color: tokens.color.text,
          padding: `${tokens.spacing.sm}px ${tokens.spacing.xs}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: `${tokens.spacing.sm}px`,
          textAlign: 'left',
          cursor: 'pointer',
          borderRadius: `${tokens.radius.md}px ${tokens.radius.md}px 0 0`,
          fontFamily: tokens.font.family,
        } as Partial<CSSStyleDeclaration>);
        const titles = document.createElement('span');
        Object.assign(titles.style, { display: 'flex', flexDirection: 'column', gap: '2px' } as Partial<CSSStyleDeclaration>);
        if (plan.section?.title) {
          const title = document.createElement('span');
          title.textContent = plan.section.title;
          Object.assign(title.style, { fontWeight: String(tokens.font.weight.bold), fontSize: `${tokens.font.size.large}px` } as Partial<CSSStyleDeclaration>);
          titles.appendChild(title);
        }
        if (plan.section?.subtitle) {
          const subtitle = document.createElement('span');
          subtitle.textContent = plan.section.subtitle;
          Object.assign(subtitle.style, { color: tokens.color.textMuted, fontSize: `${tokens.font.size.small}px` } as Partial<CSSStyleDeclaration>);
          titles.appendChild(subtitle);
        }
        if (!plan.section?.title && !plan.section?.subtitle) {
          const spacer = document.createElement('span');
          spacer.textContent = 'Section';
          Object.assign(spacer.style, { color: tokens.color.textMuted, fontSize: `${tokens.font.size.small}px` } as Partial<CSSStyleDeclaration>);
          titles.appendChild(spacer);
        }
        const marker = document.createElement('span');
        marker.textContent = plan.collapsed ? '+' : '−';
        Object.assign(marker.style, { color: tokens.color.accent, fontWeight: String(tokens.font.weight.bold) } as Partial<CSSStyleDeclaration>);
        header.appendChild(titles);
        header.appendChild(marker);
        section.appendChild(header);

        body = document.createElement('div');
        Object.assign(body.style, { display: plan.collapsed ? 'none' : 'block' } as Partial<CSSStyleDeclaration>);
        section.appendChild(body);
        header.addEventListener('click', () => {
          if (!body) return;
          const nextCollapsed = body.style.display !== 'none';
          body.style.display = nextCollapsed ? 'none' : 'block';
          marker.textContent = nextCollapsed ? '+' : '−';
          if (!nextCollapsed) {
            applyAllLayouts();
            for (const m of deferredMounts) {
              if (!m.mounted && body.contains(m.el)) {
                mount(m.el, m.view);
                m.mounted = true;
              }
            }
            for (const inst of instances) inst.resize();
          }
        });
        root.appendChild(section);
        parent = body;
      }

      const grid = document.createElement('div');
      Object.assign(grid.style, {
        display: 'grid',
        gridAutoRows: `${plan.rowHeight}px`,
        gap: `${layout.gap}px`,
      } as Partial<CSSStyleDeclaration>);
      parent.appendChild(grid);

      const cells = placeViews(plan.views, plan.cols, layout.preset ?? 'auto');
      for (const cellInfo of cells) {
        const { cell, host } = createCard(cellInfo.view);
        grid.appendChild(cell);
        cellInfo.el = cell;
        deferredMounts.push({ el: host, view: cellInfo.view, mounted: false });
      }
      layoutGroups.push({ grid, cells, baseCols: plan.cols });
    }

    const effectiveCols = (width: number, cols: number): number => {
      for (const bp of breakpoints) {
        if (width <= bp.maxWidth) return Math.max(1, Math.min(bp.cols, cols));
      }
      return cols;
    };

    // ---- Layout engine: reflow tile spans/columns by available width -------
    const applyLayout = (width: number): void => {
      for (const group of layoutGroups) {
        const gridWidth = Math.round(group.grid.getBoundingClientRect().width || width);
        const effCols = effectiveCols(gridWidth, group.baseCols);
        group.grid.style.gridTemplateColumns = `repeat(${effCols}, minmax(0, 1fr))`;
        const fullWidth = effCols === group.baseCols;
        for (const c of group.cells) {
          const resp = matchingResponsive(c.view, gridWidth);
          c.el.style.display = resp?.hidden ? 'none' : (c.el.dataset.cardDisplay ?? '');
          if (resp?.hidden) continue;
          const w = resp?.w ?? c.w;
          const h = resp?.h ?? c.h;
          const scaledW = clamp(Math.round((w * effCols) / group.baseCols), 1, effCols);
          c.el.style.gridColumn =
            fullWidth && c.x != null ? `${c.x} / span ${Math.min(w, group.baseCols)}` : `span ${scaledW}`;
          c.el.style.gridRow = fullWidth && c.y != null ? `${c.y} / span ${h}` : `span ${h}`;
        }
      }
    };

    const applyAllLayouts = (): void => applyLayout(measure());

    const measure = (): number =>
      Math.round(root?.getBoundingClientRect().width || container.clientWidth || baseCols * 80);

    // Attach, set every grid's columns/spans, THEN mount — so each cell already
    // has its final size and every view draws correctly on first paint (no
    // mount-at-wrong-size churn, no reliance on a later resize to correct it).
    container.appendChild(root);
    applyLayout(measure());

    const isVisibleForInitialMount = (el: HTMLElement): boolean => {
      for (let cur: HTMLElement | null = el; cur && cur !== root; cur = cur.parentElement) {
        if (cur.style.display === 'none') return false;
      }
      return true;
    };

    const mountVisibleDeferred = (): void => {
      for (const m of deferredMounts) {
        if (!m.mounted && root?.contains(m.el) && isVisibleForInitialMount(m.el)) {
          mount(m.el, m.view);
          m.mounted = true;
        }
      }
    };

    for (const m of deferredMounts) {
      if (!m.mounted && root.contains(m.el) && isVisibleForInitialMount(m.el)) {
        mount(m.el, m.view);
        m.mounted = true;
      }
    }

    if (typeof ResizeObserver !== 'undefined' && root) {
      resizeObs = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? measure();
        applyLayout(Math.round(w));
        mountVisibleDeferred();
      });
      resizeObs.observe(root);
    }
  };

  const teardown = (): void => {
    if (resizeObs) {
      resizeObs.disconnect();
      resizeObs = undefined;
    }
    for (const inst of instances) inst.destroy();
    instances.length = 0;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = undefined;
  };

  const unsubscribe = store.subscribe((name, value) => {
    for (const listener of [...hostListeners]) listener(name, value);
  });

  build();

  return {
    get spec() {
      return currentSpec;
    },
    store,
    views: instances,
    getSelection(name?: string) {
      return name === undefined ? store.all() : store.get(name);
    },
    setSelection(name: string, value: SelectionValue | null): void {
      store.set(name, value);
    },
    clearSelection(name?: string): void {
      store.clear(name);
    },
    on(_event: 'selectionchange', listener: SelectionChangeListener): () => void {
      hostListeners.add(listener);
      return () => hostListeners.delete(listener);
    },
    off(_event: 'selectionchange', listener: SelectionChangeListener): void {
      hostListeners.delete(listener);
    },
    update(next: DashboardSpec): void {
      if (destroyed) return;
      teardown();
      currentSpec = next;
      build();
    },
    resize(): void {
      for (const inst of instances) inst.resize();
    },
    destroy(): void {
      destroyed = true;
      unsubscribe();
      hostListeners.clear();
      teardown();
    },
  };
}
