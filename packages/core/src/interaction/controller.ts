/**
 * InteractionController — the single owner of pointer events for a Surface.
 *
 * Created once per chart instance; handed a fresh `InteractionModel` on every
 * redraw. It throttles pointer moves to one rAF, hit-tests against the current
 * model, paints the highlight onto the interaction canvas, and drives the HTML
 * tooltip. Hover never touches the marks layer.
 */

import type { Surface } from '../render/surface';
import type { ThemeTokens } from '../theme';
import { Tooltip } from './tooltip';
import type { Hover, InteractionModel } from './types';
import type { SelectionValue } from '../spec/selection';

/** How the controller publishes a click/tap selection from the current model. */
export interface ControllerSelect {
  /** Called with the picked value (or `null` when empty space is clicked). */
  onPick(value: SelectionValue | null): void;
}

export class InteractionController {
  private model: InteractionModel | null = null;
  private tokens: ThemeTokens;
  private readonly tooltip: Tooltip;

  private raf = 0;
  private pending: { x: number; y: number } | null = null;
  private activeKey: string | null = null;
  private selectCfg: ControllerSelect | null = null;
  private pickable = false;

  constructor(
    private readonly surface: Surface,
    tokens: ThemeTokens,
  ) {
    this.tokens = tokens;
    this.tooltip = new Tooltip(surface.root, tokens);
    const root = surface.root;
    root.addEventListener('pointermove', this.onMove);
    root.addEventListener('pointerleave', this.onLeave);
    root.addEventListener('pointerdown', this.onMove);
    root.addEventListener('click', this.onClick);
  }

  /** Install the model for the current frame (or `null` to disable hover). */
  setModel(model: InteractionModel | null, tokens: ThemeTokens): void {
    this.model = model;
    this.tokens = tokens;
    this.tooltip.setTokens(tokens);
    // The per-frame surface.clear() already wiped the interaction canvas and
    // any prior highlight; drop the active hover so the next move re-resolves.
    this.activeKey = null;
    this.pickable = Boolean(model?.pick);
    if (!model) this.tooltip.hide();
  }

  /** Wire click/tap selection for this chart (or `null` to disable it). */
  setSelect(cfg: ControllerSelect | null): void {
    this.selectCfg = cfg;
  }

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.model) return;
    const rect = this.surface.root.getBoundingClientRect();
    this.pending = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (!this.raf) this.raf = requestAnimationFrame(this.flush);
  };

  private readonly onLeave = (): void => {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.pending = null;
    this.clearHover();
  };

  private readonly onClick = (e: PointerEvent): void => {
    const cfg = this.selectCfg;
    const model = this.model;
    if (!cfg || !model || !model.pick) return;
    const rect = this.surface.root.getBoundingClientRect();
    cfg.onPick(model.pick(e.clientX - rect.left, e.clientY - rect.top));
  };

  private readonly flush = (): void => {
    this.raf = 0;
    const pt = this.pending;
    this.pending = null;
    if (!pt || !this.model) return;

    const hover = this.model.hitTest(pt.x, pt.y);
    if (!hover) {
      this.clearHover();
      return;
    }
    this.render(hover);
  };

  private render(hover: Hover): void {
    if (hover.key !== this.activeKey) {
      this.activeKey = hover.key;
      this.paintHighlight(hover);
      this.tooltip.setContent(hover.content);
    }
    this.tooltip.place(hover.anchorX, hover.anchorY, this.surface.width, this.surface.height);
    if (this.selectCfg && this.pickable) this.surface.root.style.cursor = 'pointer';
  }

  private paintHighlight(hover: Hover): void {
    const ctx = this.surface.interaction.ctx;
    ctx.clearRect(0, 0, this.surface.width, this.surface.height);
    if (hover.draw) hover.draw(ctx);
  }

  private clearHover(): void {
    if (this.activeKey === null) return;
    this.activeKey = null;
    this.surface.interaction.ctx.clearRect(0, 0, this.surface.width, this.surface.height);
    this.tooltip.hide();
    if (this.selectCfg && this.pickable) this.surface.root.style.cursor = '';
  }

  destroy(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    const root = this.surface.root;
    root.removeEventListener('pointermove', this.onMove);
    root.removeEventListener('pointerleave', this.onLeave);
    root.removeEventListener('pointerdown', this.onMove);
    root.removeEventListener('click', this.onClick);
    this.tooltip.destroy();
  }
}
