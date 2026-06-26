/**
 * Chart runtime: the public `render(container, spec)` entry point.
 *
 * Mounts a hybrid canvas + HTML `Surface`, resolves the theme, dispatches to the
 * right chart renderer, and manages the lifecycle (update / resize / destroy)
 * plus a deterministic "ready" signal for screenshot harnesses.
 */

import type { Size } from '../types';
import type { ChartSpec, ChartType } from '../spec/types';
import { resolveTheme, type ThemeTokens } from '../theme';
import { Surface } from '../render/surface';
import type { CanvasLayer } from '../render/canvasLayer';
import { getDevicePixelRatio } from '../render/env';
import { fontsLoading, onFontsReady } from '../render/fonts';
import { buildCartesianModel, type CartesianChartSpec, type CartesianModel } from './cartesian';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import {
  CARTESIAN_TYPES,
  cartesianRenderers,
  customRenderers,
  type CartesianRenderer,
} from '../charts';
import { InteractionController, buildCartesianInteraction } from '../interaction';
import type { InteractionModel } from '../interaction';
import { applyA11y } from '../a11y';
import {
  animate,
  resolveEntrance,
  resolveUpdate,
  prefersReducedMotion,
  type AnimationHandle,
  type ResolvedEntrance,
} from '../animation';

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
}

declare global {
  var __ENVY_READY: number | undefined;
  // Global kill-switch for entrance animations (screenshot/automation harnesses).
  var __ENVY_DISABLE_ANIM: boolean | undefined;
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
  'pie',
  'heatmap',
]);

function resolveContainer(target: HTMLElement | string): HTMLElement {
  if (typeof target === 'string') {
    const el = document.querySelector(target);
    if (!el) throw new Error(`Envy: no element matches selector "${target}"`);
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

function signalReady(surface: Surface): void {
  surface.root.setAttribute('data-envy-ready', 'true');
  globalThis.__ENVY_READY = (globalThis.__ENVY_READY ?? 0) + 1;
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

export function render(target: HTMLElement | string, spec: ChartSpec): ChartInstance {
  const container = resolveContainer(target);
  const surface = new Surface(container);

  let currentSpec = spec;
  let observer: ResizeObserver | undefined;
  let interaction: InteractionController | undefined;
  let entrance: AnimationHandle | undefined;
  let updateTransition: AnimationHandle | undefined;
  let destroyed = false;
  // Set when a draw measured text while a web font was still loading. We listen
  // for the font once and redraw so the final layout uses real metrics.
  let fontRefreshArmed = false;
  // Set when the font settles mid-entrance: we defer the corrective redraw until
  // the entrance finishes so the animation isn't cut short by a snap.
  let pendingFontRefresh = false;

  const draw = (animateEntrance: boolean): void => {
    entrance?.cancel();
    entrance = undefined;
    updateTransition?.cancel();
    updateTransition = undefined;

    const tokens = resolveTheme(currentSpec.theme);
    const size = resolveSize(container, currentSpec);
    surface.resize(size.width, size.height, getDevicePixelRatio());
    surface.root.removeAttribute('data-envy-ready');
    surface.root.style.opacity = '';
    surface.root.style.transform = '';
    surface.clear();
    paintBackground(surface, tokens, currentSpec.background);

    const anim = resolveEntrance(currentSpec.animation, {
      reducedMotion: prefersReducedMotion(),
      disabled: !animateEntrance || globalThis.__ENVY_DISABLE_ANIM === true,
    });

    let interactionModel: InteractionModel | null = null;
    const type = currentSpec.type;
    if (CARTESIAN_TYPES.has(type)) {
      const renderer = cartesianRenderers[type];
      const model = buildCartesianModel(currentSpec as CartesianChartSpec, tokens, size);
      // When animating, the marks (and their gridline underlay) are painted by
      // the entrance loop frame-by-frame; otherwise paint them once now.
      if (!anim.enabled) {
        drawAxesUnderlay(surface, model);
        if (renderer) renderer(surface, model);
      }
      drawOverlay(surface, model);
      interactionModel = buildCartesianInteraction(model);

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
        interactionModel = renderer(surface, currentSpec, tokens, size) ?? null;
      } else {
        drawPlaceholder(surface, tokens, `“${type}” renderer not yet registered`);
      }
      if (anim.enabled) {
        entrance = runFadeEntrance(surface, anim, finishEntrance);
      }
    }

    if (!interaction) interaction = new InteractionController(surface, tokens);
    interaction.setModel(interactionModel, tokens);

    applyA11y(surface, currentSpec);

    // Animated entrances signal ready on their final frame; everything else now.
    if (!entrance) signalReady(surface);

    // If text was measured with fallback metrics (web font still loading), arm a
    // one-shot corrective redraw for when the real font arrives.
    armFontRefresh();
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

  const autoResize =
    currentSpec.dimensions?.autoResize ??
    (currentSpec.dimensions?.width == null || currentSpec.dimensions?.height == null);

  if (autoResize && typeof ResizeObserver !== 'undefined') {
    // ResizeObserver fires once on observe(); that initial pass is redundant
    // with the explicit draw below, so skip it (and never animate on resize —
    // resizes must be instant to avoid jank while dragging).
    let firstObservation = true;
    observer = new ResizeObserver(() => {
      if (firstObservation) {
        firstObservation = false;
        return;
      }
      draw(false);
    });
    observer.observe(container);
  }

  draw(true);

  return {
    get spec() {
      return currentSpec;
    },
    surface,
    update(next: ChartSpec): void {
      updateTransition?.cancel();
      updateTransition = undefined;

      // Decide whether to cross-fade the marks layer: both the outgoing and
      // incoming chart must be canvas-mark kinds, motion must be enabled, and
      // the surface size must be unchanged (a dimension change is a resize, not
      // a data morph — those snap to avoid a stretched bitmap).
      const prevType = currentSpec.type;
      const prevW = surface.width;
      const prevH = surface.height;
      const anim = resolveUpdate(next.animation, {
        reducedMotion: prefersReducedMotion(),
        disabled: globalThis.__ENVY_DISABLE_ANIM === true,
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
