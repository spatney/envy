/**
 * Waterfall renderer.
 *
 * A custom renderer (it owns its layout): it resolves a {@link WaterfallModel},
 * paints the shared axis chrome via `drawAxesUnderlay` / `drawOverlay`, then draws
 * connector lines and one floating bar per stage. Increases, decreases, and total
 * bars are colored distinctly; per-bar value labels show the signed step (or the
 * absolute level for total bars).
 */

import type { Surface } from '../render/surface';
import type { Size } from '../types';
import type { ChartSpec, WaterfallSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { InteractionModel } from '../interaction/types';
import { roundedRect } from '../shape';
import { RoughPen } from '../rough';
import { drawAxesUnderlay, drawOverlay } from '../axes';
import { addOverlayText } from './chrome';
import { formatValue, formatNumber } from '../format';
import { buildWaterfallModel, type WaterfallBar, type WaterfallModel } from '../runtime/waterfall';
import type { RenderContext } from './index';

/** Connector lines joining the top of one bar to the start of the next. */
function drawConnectors(surface: Surface, model: WaterfallModel): void {
  if (model.connectors.length === 0) return;
  const ctx = surface.marks.ctx;
  const color = model.tokens.color.axis;

  if (model.sketch) {
    const pen = new RoughPen(ctx, model.sketch);
    for (const c of model.connectors) {
      pen.polyline(
        [
          { x: c.x1, y: c.y },
          { x: c.x2, y: c.y },
        ],
        { stroke: color },
      );
    }
    return;
  }

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  for (const c of model.connectors) {
    const y = Math.round(c.y) + 0.5;
    ctx.moveTo(c.x1, y);
    ctx.lineTo(c.x2, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Paint the floating bars (rounded, colored by step direction / total). */
function drawBars(surface: Surface, model: WaterfallModel): void {
  const ctx = surface.marks.ctx;
  const pen = model.sketch ? new RoughPen(ctx, model.sketch) : null;
  for (const bar of model.bars) {
    const { rect } = bar;
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (pen) {
      pen.rect(rect.x, rect.y, rect.width, rect.height, { stroke: bar.color, fill: bar.color });
      continue;
    }
    const r = Math.min(model.cornerRadius, rect.width / 2, rect.height / 2);
    ctx.beginPath();
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, [r, r, r, r]);
    ctx.fillStyle = bar.color;
    ctx.fill();
  }
}

/** The signed value label for a bar (steps show ±delta, totals show the level). */
function barLabelText(bar: WaterfallBar, format?: string): string {
  if (bar.kind === 'total') {
    return format ? formatValue(bar.displayValue, format) : formatNumber(bar.displayValue, ',');
  }
  const body = format ? formatValue(bar.delta, format) : formatNumber(bar.delta, ',');
  // formatValue already carries a leading '-' for negatives; only add '+' for rises.
  return bar.delta > 0 ? `+${body}` : body;
}

/** Per-bar value labels, centered just above each bar's top edge. */
function drawLabels(surface: Surface, model: WaterfallModel): void {
  if (!model.showLabels) return;
  const { tokens, plot } = model;
  const size = tokens.font.size.tiny;
  for (const bar of model.bars) {
    if (bar.rect.width <= 0 || bar.rect.height <= 0) continue;
    const text = barLabelText(bar, model.format);
    const top = Math.max(plot.y - 1, bar.rect.y - size - 3);
    addOverlayText(surface, tokens, {
      left: bar.rect.x - 6,
      top,
      width: bar.rect.width + 12,
      text,
      color: tokens.color.text,
      size,
      weight: tokens.font.weight.medium,
      align: 'center',
    });
  }
}

export function drawWaterfall(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  _context?: RenderContext,
): InteractionModel | void {
  const waterfall = spec as WaterfallSpec;
  const model = buildWaterfallModel(waterfall, tokens, size);

  drawAxesUnderlay(surface, model.base);
  drawConnectors(surface, model);
  drawBars(surface, model);
  drawLabels(surface, model);
  drawOverlay(surface, model.base);

  if (model.bars.length === 0) return;

  const { plot, format } = model;
  const stageField = waterfall.encoding.stage.field;
  const valueLabel = waterfall.encoding.value.title ?? waterfall.encoding.value.field;
  const fmtNum = (v: number): string => (format ? formatValue(v, format) : formatNumber(v, ','));

  const hitBar = (px: number, py: number): WaterfallBar | null => {
    for (const bar of model.bars) {
      const r = bar.rect;
      if (r.width <= 0 || r.height <= 0) continue;
      if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) return bar;
    }
    return null;
  };

  return {
    region: { x: plot.x, y: plot.y, width: plot.width, height: plot.height },
    hitTest: (px, py) => {
      const bar = hitBar(px, py);
      if (!bar) return null;
      const rows =
        bar.kind === 'total'
          ? [{ swatch: bar.color, label: valueLabel, value: fmtNum(bar.displayValue) }]
          : [
              { swatch: bar.color, label: 'change', value: barLabelText(bar, format) },
              { label: 'running total', value: fmtNum(bar.cumulative), muted: true },
            ];
      return {
        key: bar.key,
        anchorX: bar.rect.x + bar.rect.width / 2,
        anchorY: bar.rect.y,
        content: { title: bar.label, rows },
      };
    },
    pick: (px, py) => {
      const bar = hitBar(px, py);
      if (!bar || bar.stageValue === undefined) return null;
      return { kind: 'point', fields: [stageField], tuples: [[bar.stageValue]] };
    },
  };
}
