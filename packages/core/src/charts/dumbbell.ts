import { formatNumber, formatValue } from '../format';
import type { Surface } from '../render/surface';
import { fontString, measureText } from '../render/text';
import { RoughPen } from '../rough';
import { bandScale, linearScale } from '../scales';
import type { ChartSpec, DumbbellSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Rect, Size } from '../types';
import type { InteractionModel } from '../interaction/types';
import type { RenderContext } from './index';
import { ticks as numericTicks } from '../ticks';
import { buildDumbbellModel, formatDumbbellValue, type DumbbellDot, type DumbbellGroup, type DumbbellRow } from '../runtime/dumbbell';
import { addOverlayText, CHROME_PAD, drawCategoricalLegend, drawTitleBlock, type LegendEntry } from './chrome';

interface PixelDot extends DumbbellDot {
  x: number;
  y: number;
  color: string;
  label: string;
}

interface PixelRow extends DumbbellRow {
  y: number;
  pixelDots: PixelDot[];
}

function measureMax(labels: readonly string[], font: string): number {
  let max = 0;
  for (const label of labels) max = Math.max(max, measureText(label, font).width);
  return max;
}

function valueLabel(value: number, format?: string): string {
  return format ? formatValue(value, format) : formatNumber(value, ',');
}

function drawConnector(ctx: CanvasRenderingContext2D, pen: RoughPen | null, x1: number, x2: number, y: number, tokens: ThemeTokens): void {
  if (pen) {
    pen.polyline(
      [
        { x: x1, y },
        { x: x2, y },
      ],
      { stroke: tokens.color.axis, roughness: 0.65 },
    );
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.strokeStyle = tokens.color.axis;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

function drawDot(ctx: CanvasRenderingContext2D, pen: RoughPen | null, x: number, y: number, color: string, tokens: ThemeTokens): void {
  const r = 5;
  if (pen) {
    pen.circle(x, y, r + 1.5, { fill: tokens.color.background, stroke: tokens.color.background });
    pen.circle(x, y, r, { fill: color, stroke: tokens.color.background });
    return;
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = tokens.color.background;
  ctx.stroke();
  ctx.restore();
}

function layoutPlot(content: Rect, labelWidth: number, tokens: ThemeTokens): { plot: Rect; leftGutter: number; axisHeight: number } {
  const leftGutter = Math.ceil(Math.min(content.width * 0.3, Math.max(42, labelWidth + tokens.spacing.sm)));
  const axisHeight = 28;
  const topPad = Math.min(6, CHROME_PAD.top / 2);
  const rightPad = 8;
  return {
    leftGutter,
    axisHeight,
    plot: {
      x: content.x + leftGutter,
      y: content.y + topPad,
      width: Math.max(0, content.width - leftGutter - rightPad),
      height: Math.max(0, content.height - axisHeight - topPad),
    },
  };
}

export function drawDumbbell(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  _context?: RenderContext,
): InteractionModel | void {
  void _context;
  const dumbbell = spec as DumbbellSpec;
  const model = buildDumbbellModel(dumbbell, tokens, size);
  const ctx = surface.marks.ctx;

  let content = drawTitleBlock(surface, tokens, size, dumbbell.title);
  const legendEntries: LegendEntry[] = model.groups.map((group) => ({ label: group.label, color: group.color, symbol: 'circle' }));
  content = drawCategoricalLegend(surface, tokens, content, legendEntries, 'top');

  if (model.rows.length === 0 || model.groups.length === 0 || content.width <= 0 || content.height <= 0) {
    addOverlayText(surface, tokens, {
      left: content.x,
      top: content.y + Math.max(CHROME_PAD.top, content.height / 2 - tokens.font.size.small / 2),
      width: content.width,
      text: 'No values',
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      align: 'center',
    });
    return;
  }

  const labelFont = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.normal);
  const widestCategory = measureMax(model.rows.map((row) => row.catLabel), labelFont);
  const { plot, leftGutter } = layoutPlot(content, widestCategory, tokens);
  if (plot.width <= 8 || plot.height <= 8) return;

  const xScale = linearScale({ domain: model.valueDomain, range: [plot.x, plot.x + plot.width] });
  const yBand = bandScale({ domain: model.categories, range: [plot.y, plot.y + plot.height], paddingInner: 0.45, paddingOuter: 0.25 });
  const ticks = numericTicks(model.valueDomain[0], model.valueDomain[1], 6);
  const groupByKey = new Map<string, DumbbellGroup>(model.groups.map((group) => [group.key, group]));
  const pen = model.sketch ? new RoughPen(ctx, model.sketch) : null;

  ctx.save();
  ctx.strokeStyle = tokens.color.grid;
  ctx.lineWidth = 1;
  for (const tick of ticks) {
    const x = xScale.map(tick);
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.height);
    ctx.stroke();
    addOverlayText(surface, tokens, {
      left: x,
      top: plot.y + plot.height + 6,
      text: valueLabel(tick, model.format),
      color: tokens.color.textMuted,
      size: tokens.font.size.tiny,
      transform: 'translateX(-50%)',
    });
  }
  ctx.restore();

  const pixelRows: PixelRow[] = [];
  for (const row of model.rows) {
    const bandTop = yBand.map(row.catKey);
    if (bandTop === undefined) continue;
    const cy = bandTop + yBand.bandwidth / 2;
    const pixelDots = row.dots
      .map((dot) => {
        const group = groupByKey.get(dot.groupKey);
        return {
          ...dot,
          x: xScale.map(dot.value),
          y: cy,
          color: group?.color ?? tokens.color.text,
          label: group?.label ?? dot.groupKey,
        };
      })
      .sort((a, b) => a.x - b.x);

    if (pixelDots.length === 0) continue;
    pixelRows.push({ ...row, y: cy, pixelDots });

    drawConnector(ctx, pen, pixelDots[0].x, pixelDots[pixelDots.length - 1].x, cy, tokens);
    for (const dot of pixelDots) drawDot(ctx, pen, dot.x, cy, dot.color, tokens);

    addOverlayText(surface, tokens, {
      left: content.x,
      top: cy,
      width: Math.max(0, leftGutter - tokens.spacing.sm),
      text: row.catLabel,
      color: tokens.color.text,
      size: tokens.font.size.small,
      align: 'right',
      transform: 'translateY(-50%)',
    });

    if (dumbbell.labels) {
      for (let i = 0; i < pixelDots.length; i++) {
        const dot = pixelDots[i];
        const atLeft = i === 0 && pixelDots.length > 1;
        addOverlayText(surface, tokens, {
          left: atLeft ? dot.x - 7 : dot.x + 7,
          top: cy,
          width: 54,
          text: formatDumbbellValue(dot.value, model.format),
          color: tokens.color.textMuted,
          size: tokens.font.size.tiny,
          align: atLeft ? 'right' : 'left',
          transform: atLeft ? 'translate(-100%,-50%)' : 'translateY(-50%)',
        });
      }
    }
  }

  const categoryField = dumbbell.encoding.category.field;
  const nearestDot = (px: number, py: number): { row: PixelRow; dot: PixelDot; dist2: number } | null => {
    let best: { row: PixelRow; dot: PixelDot; dist2: number } | null = null;
    for (const row of pixelRows) {
      for (const dot of row.pixelDots) {
        const dx = px - dot.x;
        const dy = py - dot.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 <= 64 && (!best || dist2 < best.dist2)) best = { row, dot, dist2 };
      }
    }
    return best;
  };

  return {
    region: plot,
    hitTest: (px, py) => {
      const hit = nearestDot(px, py);
      if (!hit) return null;
      const gap = hit.row.max - hit.row.min;
      return {
        key: `${hit.row.catKey}/${hit.dot.groupKey}`,
        anchorX: hit.dot.x,
        anchorY: hit.dot.y,
        content: {
          title: hit.row.catLabel,
          rows: [
            ...hit.row.pixelDots.map((dot) => ({
              swatch: dot.color,
              label: dot.label,
              value: valueLabel(dot.value, model.format),
              strong: dot.groupKey === hit.dot.groupKey,
            })),
            ...(hit.row.pixelDots.length > 1 ? [{ label: 'gap', value: valueLabel(gap, model.format), muted: true }] : []),
          ],
        },
      };
    },
    pick: (px, py) => {
      const hit = nearestDot(px, py);
      if (!hit) return null;
      return { kind: 'point', fields: [categoryField], tuples: [[hit.row.catRawValue]] };
    },
  };
}