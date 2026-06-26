/**
 * Chart runtime: the public `render(container, spec)` entry point.
 *
 * Mounts a hybrid canvas + HTML `Surface`, resolves the theme, dispatches to the
 * right chart renderer, and manages the lifecycle (update / resize / destroy)
 * plus a deterministic "ready" signal for screenshot harnesses.
 */

import type { Size } from '../types';
import type { ChartSpec } from '../spec/types';
import { resolveTheme, type ThemeTokens } from '../theme';
import { Surface } from '../render/surface';
import { getDevicePixelRatio } from '../render/env';
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

  const draw = (animateEntrance: boolean): void => {
    entrance?.cancel();
    entrance = undefined;

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
        entrance = runCartesianEntrance(surface, model, renderer, tokens, currentSpec.background, anim, () =>
          signalReady(surface),
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
        entrance = runFadeEntrance(surface, anim, () => signalReady(surface));
      }
    }

    if (!interaction) interaction = new InteractionController(surface, tokens);
    interaction.setModel(interactionModel, tokens);

    applyA11y(surface, currentSpec);

    // Animated entrances signal ready on their final frame; everything else now.
    if (!entrance) signalReady(surface);
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
      currentSpec = next;
      draw(false);
    },
    resize(): void {
      draw(false);
    },
    destroy(): void {
      entrance?.cancel();
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
