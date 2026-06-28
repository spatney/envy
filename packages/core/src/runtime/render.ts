/**
 * Chart runtime: the public `render(container, spec)` entry point.
 *
 * Mounts a hybrid canvas + HTML `Surface`, resolves the theme, dispatches to the
 * right chart renderer, and manages the lifecycle (update / resize / destroy)
 * plus a deterministic "ready" signal for screenshot harnesses.
 */

import type { Datum, Size } from '../types';
import type { ChartSpec, ChartType } from '../spec/types';
import { resolveSketch } from '../spec/sketch';
import { applyTransforms } from '../spec/transform';
import { resolveTheme, withSketchFont, ensureSketchFont, type ThemeTokens } from '../theme';
import { Surface } from '../render/surface';
import type { CanvasLayer } from '../render/canvasLayer';
import { getDevicePixelRatio } from '../render/env';
import { fontsLoading, onFontsReady } from '../render/fonts';
import { buildCartesianModel, type CartesianChartSpec, type CartesianModel } from './cartesian';
import { buildRenderReport, type RenderReport } from './report';
import { isFaceted, buildFacetModels, drawFacet, facetReport } from './facet';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import {
  CARTESIAN_TYPES,
  cartesianRenderers,
  cartesianInteractionBuilders,
  customRenderers,
  drawAnnotations,
  drawAnnotationLabels,
  drawTrendlines,
  drawTrendlineLabels,
  type CartesianRenderer,
} from '../charts';
import { InteractionController, buildCartesianInteraction } from '../interaction';
import type { InteractionModel } from '../interaction';
import { createSelectionStore, type SelectionStore } from '../interaction/store';
import {
  applyPick,
  resolveEmphasis,
  resolveFilterValues,
  dependentParams,
  DIM_ALPHA,
  type SelectConfig,
} from '../interaction/select';
import { filterRows } from '../interaction/predicate';
import type { RenderContext } from '../charts';
import type { SelectionValue } from '../spec/selection';
import { applyA11y } from '../a11y';
import {
  animate,
  resolveEntrance,
  resolveUpdate,
  prefersReducedMotion,
  type AnimationHandle,
  type ResolvedEntrance,
} from '../animation';

/** A change to a named selection: the param name and its new value (or null). */
export type SelectionChangeListener = (name: string, value: SelectionValue | null) => void;

/** Options for {@link render}. */
export interface RenderOptions {
  /**
   * A shared selection bus. Pass the same store to multiple `render()` calls to
   * link them (cross-highlight / cross-filter). Omit to give the chart its own
   * private store.
   */
  store?: SelectionStore;
  /**
   * The chart is mounted inside a host that already provides card chrome (e.g. a
   * dashboard cell). Renderers that normally draw their own card (KPI) render
   * flat so the chrome isn't doubled. Optional; defaults to false.
   */
  frame?: boolean;
}

export interface ChartInstance {
  /** Re-render with a new spec (data or config changes). */
  update(spec: ChartSpec): void;
  /** Re-measure the container (or use explicit dims) and redraw. */
  resize(width?: number, height?: number): void;
  /** Tear down DOM, observers, and listeners. */
  destroy(): void;
  /** The currently rendered spec. */
  readonly spec: ChartSpec;
  /** The mounted surface (advanced/imperative use). */
  readonly surface: Surface;
  /**
   * Machine-readable diagnostics from the most recent render: mark count,
   * clipped axis labels, legend overflow, low-contrast colors, degenerate axes,
   * and out-of-bounds marks. Lets an agent verify the chart "looks right"
   * without vision. Computed purely from the resolved model, so it works
   * identically in the browser and headless.
   */
  report(): RenderReport;
  /** The selection bus this chart is bound to (advanced/linking use). */
  readonly store: SelectionStore;
  /** Read a param's current value, or a snapshot of all params when omitted. */
  getSelection(name?: string): SelectionValue | null | Record<string, SelectionValue | null>;
  /** Set a param's value (drives highlight/filter across linked visuals). */
  setSelection(name: string, value: SelectionValue | null): void;
  /** Clear one param, or every param when `name` is omitted. */
  clearSelection(name?: string): void;
  /** Subscribe to selection changes; returns an unsubscribe function. */
  on(event: 'selectionchange', listener: SelectionChangeListener): () => void;
  /** Remove a previously-registered selection listener. */
  off(event: 'selectionchange', listener: SelectionChangeListener): void;
}

declare global {
  var __GRAPHEIN_READY: number | undefined;
  // Global kill-switch for entrance animations (screenshot/automation harnesses).
  var __GRAPHEIN_DISABLE_ANIM: boolean | undefined;
}

/**
 * Chart kinds whose data marks are painted to the `marks` canvas (cartesian
 * plus pie/heatmap). Updates to these cross-fade the marks layer; the DOM-only
 * kinds (kpi/table/matrix) update instantly since there's no canvas to dissolve.
 */
const CANVAS_MARK_TYPES: ReadonlySet<ChartType> = new Set<ChartType>([
  'line',
  'area',
  'bar',
  'scatter',
  'box',
  'pie',
  'heatmap',
  'sankey',
  'choropleth',
]);

function resolveContainer(target: HTMLElement | string): HTMLElement {
  if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (!el) throw new Error(`Graphein: no element matches selector "${target}"`);
    return el as HTMLElement;
  }
  return target;
}

function resolveSize(container: HTMLElement, spec: ChartSpec): Size {
  const d = spec.dimensions;
  const width = d?.width ?? (container.clientWidth || 640);
  const height = d?.height ?? (container.clientHeight || 400);
  return { width: Math.max(1, width), height: Math.max(1, height) };
}

/** Resolve the theme, swapping in the handwriting font when sketching with text. */
function resolveSketchTokens(spec: ChartSpec): ThemeTokens {
  const tokens = resolveTheme(spec.theme);
  const sketch = resolveSketch(spec);
  return sketch?.font ? withSketchFont(tokens) : tokens;
}

function signalReady(surface: Surface): void {
  surface.root.setAttribute('data-graphein-ready', 'true');
  globalThis.__GRAPHEIN_READY = (globalThis.__GRAPHEIN_READY ?? 0) + 1;
}

function paintBackground(surface: Surface, tokens: ThemeTokens, override?: string): void {
  const bg = override ?? tokens.color.background;
  surface.root.style.background = bg;
  const ctx = surface.marks.ctx;
  ctx.save();
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, surface.width, surface.height);
  ctx.restore();
}

export function render(
  target: HTMLElement | string,
  spec: ChartSpec,
  options?: RenderOptions,
): ChartInstance {
  const container = resolveContainer(target);
  const surface = new Surface(container);

  let currentSpec = spec;
  let observer: ResizeObserver | undefined;
  let interaction: InteractionController | undefined;
  let entrance: AnimationHandle | undefined;
  let updateTransition: AnimationHandle | undefined;
  let destroyed = false;
  // The size we last actually drew at. The resize observer redraws only when the
  // container's measured size diverges from this, so a resize that lands between
  // render() and the observer's first delivery (e.g. a dashboard that mounts a
  // view and then reflows its grid) is honored instead of dropped.
  let lastDrawnW = -1;
  let lastDrawnH = -1;
  // Set when a draw measured text while a web font was still loading. We listen
  // for the font once and redraw so the final layout uses real metrics.
  let fontRefreshArmed = false;
  // Set when the font settles mid-entrance: we defer the corrective redraw until
  // the entrance finishes so the animation isn't cut short by a snap.
  let pendingFontRefresh = false;
  // One-shot guard so the lazy sketch-font load only ever arms a single redraw.
  let sketchFontArmed = false;
  // The diagnostics from the most recent draw(), exposed via instance.report().
  let lastReport: RenderReport | null = null;

  // Memoize the transform pipeline so resize/redraw don't recompute it. Keyed on
  // the (immutable) spec.data and spec.transform references, so a new spec passed
  // to update() naturally refreshes the cache.
  let txSrc: Datum[] | undefined;
  let txDef: unknown;
  let txOut: Datum[] = [];
  const effectiveData = (): Datum[] => {
    const src = currentSpec.data ?? [];
    const tx = currentSpec.transform;
    if (!tx || tx.length === 0) return src;
    if (txSrc === src && txDef === tx) return txOut;
    txSrc = src;
    txDef = tx;
    txOut = applyTransforms(tx, src);
    return txOut;
  };

  // Selection bus: shared (linked charts) or private to this instance. Seed any
  // initial param values that aren't already present so a shared store wins.
  const store = options?.store ?? createSelectionStore();
  for (const param of currentSpec.params ?? []) {
    if (param.value !== undefined && store.get(param.name) == null) {
      store.set(param.name, param.value ?? null);
    }
  }
  const hostListeners = new Set<SelectionChangeListener>();

  const draw = (animateEntrance: boolean): void => {
    entrance?.cancel();
    entrance = undefined;
    updateTransition?.cancel();
    updateTransition = undefined;

    const tokens = resolveSketchTokens(currentSpec);
    const size = resolveSize(container, currentSpec);
    lastDrawnW = size.width;
    lastDrawnH = size.height;
    surface.resize(size.width, size.height, getDevicePixelRatio());
    surface.root.removeAttribute('data-graphein-ready');
    surface.root.style.opacity = '';
    surface.root.style.transform = '';
    surface.clear();
    paintBackground(surface, tokens, currentSpec.background);

    const anim = resolveEntrance(currentSpec.animation, {
      reducedMotion: prefersReducedMotion(),
      disabled: !animateEntrance || globalThis.__GRAPHEIN_DISABLE_ANIM === true,
    });

    // Resolve interactivity for this frame: the rows after cross-filtering, and
    // the highlight (emphasis) to dim non-selected marks.
    const filterValues = resolveFilterValues(currentSpec.filter, store);
    const baseData = effectiveData();
    const filtered = filterValues.length ? filterRows(baseData, filterValues) : baseData;
    const effectiveSpec =
      filtered === baseData ? currentSpec : ({ ...currentSpec, data: filtered } as ChartSpec);
    const emphasis = resolveEmphasis(currentSpec.highlight, store, DIM_ALPHA);
    const ownParam = currentSpec.params?.[0];

    let interactionModel: InteractionModel | null = null;
    let reportModel: CartesianModel | undefined;
    let facetRpt: RenderReport | undefined;
    const type = currentSpec.type;
    // Faceting: a trellis grid of comparable panels on one canvas. Static in v1
    // (no per-panel interaction), so it short-circuits the normal dispatch.
    const facetLayout = isFaceted(effectiveSpec) ? buildFacetModels(effectiveSpec, tokens, size) : null;
    if (facetLayout) {
      drawFacet(surface, effectiveSpec, facetLayout, tokens);
      facetRpt = facetReport(effectiveSpec, facetLayout, tokens, size);
    } else if (CARTESIAN_TYPES.has(type)) {
      const renderer = cartesianRenderers[type];
      const model = buildCartesianModel(effectiveSpec as CartesianChartSpec, tokens, size);
      model.emphasis = emphasis;
      reportModel = model;
      // When animating, the marks (and their gridline underlay) are painted by
      // the entrance loop frame-by-frame; otherwise paint them once now.
      if (!anim.enabled) {
        drawAxesUnderlay(surface, model);
        if (renderer) renderer(surface, model);
        drawTrendlines(surface, model);
        drawAnnotations(surface, model);
      }
      drawOverlay(surface, model);
      drawAnnotationLabels(surface, model);
      drawTrendlineLabels(surface, model);
      const overrideInteraction = cartesianInteractionBuilders[type];
      interactionModel = overrideInteraction
        ? (overrideInteraction(model) ?? null)
        : buildCartesianInteraction(model);

      if (anim.enabled && renderer) {
        entrance = runCartesianEntrance(
          surface,
          model,
          renderer,
          tokens,
          currentSpec.background,
          anim,
          finishEntrance,
        );
      }
    } else {
      const renderer = customRenderers[type];
      if (renderer) {
        const ctx: RenderContext = {
          emphasis,
          store,
          param: ownParam?.name,
          def: ownParam?.select,
          sourceData: baseData,
          framed: options?.frame === true,
          requestRedraw: () => {
            if (!destroyed) draw(false);
          },
        };
        interactionModel = renderer(surface, effectiveSpec, tokens, size, ctx) ?? null;
      } else {
        drawPlaceholder(surface, tokens, `“${type}” renderer not yet registered`);
      }
      if (anim.enabled) {
        entrance = runFadeEntrance(surface, anim, finishEntrance);
      }
    }

    if (!interaction) interaction = new InteractionController(surface, tokens);
    interaction.setModel(interactionModel, tokens);
    // Wire click/tap selection when this chart defines a param and its model can
    // resolve a pick. Slicers publish via the render context instead.
    if (ownParam && interactionModel?.pick) {
      const cfg: SelectConfig = { store, param: ownParam.name, def: ownParam.select };
      interaction.setSelect({ onPick: (value) => applyPick(cfg, value) });
    } else {
      interaction.setSelect(null);
    }

    applyA11y(surface, currentSpec);

    // Derive the machine-readable render report from the resolved model. Pure
    // (reads the model + theme, never the canvas), so it works headlessly too.
    lastReport = facetRpt ?? buildRenderReport({
      type,
      spec: currentSpec,
      data: filtered,
      tokens,
      size,
      model: reportModel,
    });

    // Animated entrances signal ready on their final frame; everything else now.
    if (!entrance) signalReady(surface);

    // If text was measured with fallback metrics (web font still loading), arm a
    // one-shot corrective redraw for when the real font arrives.
    armFontRefresh();
    // Sketch charts use a bundled handwriting font that loads lazily; once it's
    // ready, redraw so text is laid out with its real glyph metrics.
    armSketchFont();
  };

  // Entrance completion: mark ready, then apply any font-load correction that was
  // deferred so it wouldn't interrupt the animation.
  const finishEntrance = (): void => {
    signalReady(surface);
    if (pendingFontRefresh && !destroyed) {
      pendingFontRefresh = false;
      draw(false);
    }
  };

  // Self-healing layout: a chart drawn before its web font loads is measured with
  // fallback metrics. Listen once for the font and redraw with real metrics. If
  // an entrance is mid-flight, defer the redraw to its completion to avoid a snap.
  const armFontRefresh = (): void => {
    if (fontRefreshArmed || !fontsLoading()) return;
    fontRefreshArmed = true;
    onFontsReady(() => {
      fontRefreshArmed = false;
      if (destroyed) return;
      if (entrance) {
        pendingFontRefresh = true;
      } else {
        draw(false);
      }
    });
  };

  // The sketch font is bundled and loads lazily (data URL, no network). When it
  // first becomes available, redraw once so handwriting metrics replace the
  // fallback ones. `ensureSketchFont` resolves `true` only on the load that
  // actually injected it, so this never loops.
  const armSketchFont = (): void => {
    if (sketchFontArmed || !resolveSketch(currentSpec)?.font) return;
    sketchFontArmed = true;
    void ensureSketchFont().then((loaded) => {
      if (loaded && !destroyed) draw(false);
    });
  };

  const autoResize =
    currentSpec.dimensions?.autoResize ??
    (currentSpec.dimensions?.width == null || currentSpec.dimensions?.height == null);

  if (autoResize && typeof ResizeObserver !== 'undefined') {
    // Redraw on container resize, but only when the measured size actually
    // diverges from what we last drew. That skips the redundant delivery the
    // observer fires on observe() (same size as the explicit draw below) while
    // still honoring a resize that lands before the first delivery — e.g. a
    // dashboard that mounts a view and then reflows its grid. (Unconditionally
    // skipping the first delivery dropped that reflow, leaving the chart stuck at
    // its pre-reflow size on any redraw where a font load didn't mask it.)
    // Resizes never animate — they must be instant to avoid jank while dragging.
    observer = new ResizeObserver(() => {
      if (destroyed) return;
      const s = resolveSize(container, currentSpec);
      if (s.width === lastDrawnW && s.height === lastDrawnH) return;
      draw(false);
    });
    observer.observe(container);
  }

  // React to selection changes: notify host listeners, then redraw if the change
  // touches a param this chart consumes (its highlight or a filter clause).
  const unsubscribe = store.subscribe((name, value) => {
    for (const listener of [...hostListeners]) listener(name, value);
    if (destroyed) return;
    if (dependentParams(currentSpec.highlight, currentSpec.filter).has(name)) {
      draw(false);
    }
  });

  draw(true);

  return {
    get spec() {
      return currentSpec;
    },
    surface,
    store,
    report(): RenderReport {
      // Fall back to a minimal report if called before the first draw settles.
      return (
        lastReport ?? {
          type: currentSpec.type,
          size: resolveSize(container, currentSpec),
          markCount: 0,
          seriesCount: 0,
          colorCount: 0,
          ok: true,
          diagnostics: [],
        }
      );
    },
    getSelection(name?: string): SelectionValue | null | Record<string, SelectionValue | null> {
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
    update(next: ChartSpec): void {
      updateTransition?.cancel();
      updateTransition = undefined;

      // Seed any newly-introduced initial param values from the next spec.
      for (const param of next.params ?? []) {
        if (param.value !== undefined && store.get(param.name) == null) {
          store.set(param.name, param.value ?? null);
        }
      }

      // Decide whether to cross-fade the marks layer: both the outgoing and
      // incoming chart must be canvas-mark kinds, motion must be enabled, and
      // the surface size must be unchanged (a dimension change is a resize, not
      // a data morph — those snap to avoid a stretched bitmap).
      const prevType = currentSpec.type;
      const prevW = surface.width;
      const prevH = surface.height;
      const anim = resolveUpdate(next.animation, {
        reducedMotion: prefersReducedMotion(),
        disabled: globalThis.__GRAPHEIN_DISABLE_ANIM === true,
      });
      const wantFade =
        anim.enabled && CANVAS_MARK_TYPES.has(prevType) && CANVAS_MARK_TYPES.has(next.type);
      const before = wantFade ? snapshotLayer(surface.marks) : undefined;

      currentSpec = next;
      draw(false);

      if (
        before &&
        surface.width === prevW &&
        surface.height === prevH &&
        surface.marks.canvas.width === before.width &&
        surface.marks.canvas.height === before.height
      ) {
        updateTransition = runUpdateCrossfade(surface, before, anim);
      }
    },
    resize(): void {
      draw(false);
    },
    destroy(): void {
      destroyed = true;
      unsubscribe();
      hostListeners.clear();
      entrance?.cancel();
      updateTransition?.cancel();
      observer?.disconnect();
      interaction?.destroy();
      surface.destroy();
    },
  };
}

/**
 * Cartesian entrance: a left-to-right wipe with a brief fade. Gridlines + axis
 * baselines stay fully drawn while the data marks sweep in. The final frame is
 * pixel-identical to a static draw.
 */
function runCartesianEntrance(
  surface: Surface,
  model: CartesianModel,
  renderer: CartesianRenderer,
  tokens: ThemeTokens,
  background: string | undefined,
  anim: ResolvedEntrance,
  onDone: () => void,
): AnimationHandle {
  const ctx = surface.marks.ctx;
  const { plot } = model;
  const bg = background ?? tokens.color.background;

  const paintFrame = (t: number): void => {
    surface.marks.clear();
    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, surface.width, surface.height);
    ctx.restore();
    drawAxesUnderlay(surface, model);
    if (t <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, 0.2 + 0.8 * t);
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.width * t, plot.height + 1);
    ctx.clip();
    renderer(surface, model);
    ctx.restore();
    drawTrendlines(surface, model);
    drawAnnotations(surface, model);
  };

  paintFrame(0);
  return animate({
    duration: anim.duration,
    easing: anim.easing,
    onUpdate: paintFrame,
    onComplete: () => {
      paintFrame(1);
      onDone();
    },
  });
}

/**
 * Custom-chart entrance: a compositor-friendly opacity + slight upward rise of
 * the whole surface. Used for charts whose content is already fully painted
 * (pie/heatmap canvas, kpi/table/matrix DOM), so re-running the renderer per
 * frame isn't needed.
 */
function runFadeEntrance(
  surface: Surface,
  anim: ResolvedEntrance,
  onDone: () => void,
): AnimationHandle {
  const root = surface.root;
  const apply = (t: number): void => {
    root.style.opacity = String(t);
    const dy = (1 - t) * 8;
    root.style.transform = dy > 0.02 ? `translateY(${dy.toFixed(2)}px)` : '';
  };

  apply(0);
  return animate({
    duration: anim.duration,
    easing: anim.easing,
    onUpdate: apply,
    onComplete: () => {
      root.style.opacity = '';
      root.style.transform = '';
      onDone();
    },
  });
}

/**
 * Copy a canvas layer's current backing store into a detached canvas so it can
 * be composited later (used to cross-fade the previous frame on update()).
 */
function snapshotLayer(layer: CanvasLayer): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = layer.canvas.width;
  off.height = layer.canvas.height;
  if (off.width > 0 && off.height > 0) {
    const octx = off.getContext('2d');
    octx?.drawImage(layer.canvas, 0, 0);
  }
  return off;
}

/**
 * Update transition: cross-fade the marks layer from the previous frame to the
 * freshly drawn one. The new frame is already live on the canvas when this runs,
 * so we snapshot it and composite `new` under `old` with `old` fading out. The
 * final frame is pixel-identical to the static (instant) draw.
 */
function runUpdateCrossfade(
  surface: Surface,
  before: HTMLCanvasElement,
  anim: ResolvedEntrance,
): AnimationHandle {
  const after = snapshotLayer(surface.marks);
  const ctx = surface.marks.ctx;
  const w = surface.marks.width;
  const h = surface.marks.height;

  const paint = (t: number): void => {
    surface.marks.clear();
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.drawImage(after, 0, 0, w, h);
    if (t < 1) {
      ctx.globalAlpha = 1 - t;
      ctx.drawImage(before, 0, 0, w, h);
    }
    ctx.restore();
  };

  paint(0);
  return animate({
    duration: anim.duration,
    easing: anim.easing,
    onUpdate: paint,
    onComplete: () => paint(1),
  });
}

function drawPlaceholder(surface: Surface, tokens: ThemeTokens, message: string): void {
  const ctx = surface.marks.ctx;
  ctx.save();
  ctx.fillStyle = tokens.color.textMuted;
  ctx.font = `${tokens.font.size.base}px ${tokens.font.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, surface.width / 2, surface.height / 2);
  ctx.restore();
}
