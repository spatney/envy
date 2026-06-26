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
import { buildCartesianModel, type CartesianChartSpec } from './cartesian';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import {
  CARTESIAN_TYPES,
  cartesianRenderers,
  customRenderers,
} from '../charts';

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
  // eslint-disable-next-line no-var
  var __ENVY_READY: number | undefined;
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

  const draw = (): void => {
    const tokens = resolveTheme(currentSpec.theme);
    const size = resolveSize(container, currentSpec);
    surface.resize(size.width, size.height, getDevicePixelRatio());
    surface.root.removeAttribute('data-envy-ready');
    surface.clear();
    paintBackground(surface, tokens, currentSpec.background);

    const type = currentSpec.type;
    if (CARTESIAN_TYPES.has(type)) {
      const renderer = cartesianRenderers[type];
      const model = buildCartesianModel(currentSpec as CartesianChartSpec, tokens, size);
      drawAxesUnderlay(surface, model);
      if (renderer) renderer(surface, model);
      drawOverlay(surface, model);
    } else {
      const renderer = customRenderers[type];
      if (renderer) {
        renderer(surface, currentSpec, tokens, size);
      } else {
        drawPlaceholder(surface, tokens, `“${type}” renderer not yet registered`);
      }
    }
    signalReady(surface);
  };

  const autoResize =
    currentSpec.dimensions?.autoResize ??
    (currentSpec.dimensions?.width == null || currentSpec.dimensions?.height == null);

  if (autoResize && typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => draw());
    observer.observe(container);
  }

  draw();

  return {
    get spec() {
      return currentSpec;
    },
    surface,
    update(next: ChartSpec): void {
      currentSpec = next;
      draw();
    },
    resize(): void {
      draw();
    },
    destroy(): void {
      observer?.disconnect();
      surface.destroy();
    },
  };
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
