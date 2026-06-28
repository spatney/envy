import { sequential, sequentialColorScale, rgbaToCss } from '../color';
import { formatValue } from '../format';
import type { Surface } from '../render/surface';
import { fontString, measureText } from '../render/text';
import { bandScale } from '../scales';
import { roundedRect } from '../shape';
import { RoughPen } from '../rough';
import { resolveSketch } from '../spec/sketch';
import type { ChartSpec, HeatmapSpec } from '../spec/types';
import type { Datum, Rect, Size } from '../types';
import type { ThemeTokens } from '../theme';
import { accessor, toKey, toNumber, uniqueStrings } from '../util/data';
import type { InteractionModel } from '../interaction/types';
import type { RenderContext } from './index';
import { rowAlpha } from './emphasis';
import { addOverlayText, CHROME_PAD, drawTitleBlock } from './chrome';

const MIN_GRID_SIZE = 8;
/** Above this cell count, sketch mode keeps clean cells (rough fills get too dense/slow). */
const MAX_ROUGH_CELLS = 800;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function categoryKey(value: unknown): string {
  return value instanceof Date ? String(value) : toKey(value);
}

function measureMax(labels: readonly string[], font: string): number {
  let max = 0;
  for (const label of labels) max = Math.max(max, measureText(label, font).width);
  return max;
}

export function heatmapColorDomain(rows: readonly Datum[], field: string): [number, number] | null {
  const read = accessor(field);
  let min = Infinity;
  let max = -Infinity;
  for (const row of rows) {
    const value = toNumber(read(row));
    if (!finite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return min === Infinity ? null : [min, max];
}

function drawRoundedCell(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  if (!finite(x) || !finite(y) || !finite(width) || !finite(height) || width <= 0 || height <= 0) return;
  ctx.beginPath();
  roundedRect(ctx, x, y, width, height, Math.min(radius, width / 2, height / 2));
  ctx.fill();
}

function drawLegend(
  surface: Surface,
  tokens: ThemeTokens,
  legend: Rect,
  min: number,
  max: number,
  spec: HeatmapSpec,
): void {
  if (legend.width <= 0 || legend.height <= 0) return;

  const ctx = surface.marks.ctx;
  const interp = sequential(spec.scheme ?? 'teal');
  const barWidth = Math.floor(clamp(legend.width * 0.48, Math.min(legend.width, 120), Math.min(legend.width, 220)));
  const barHeight = 10;
  const barX = Math.round(legend.x + (legend.width - barWidth) / 2);
  const barY = Math.round(legend.y + 4);
  const sameDomain = min === max;

  for (let i = 0; i < barWidth; i++) {
    const t = sameDomain ? 0.5 : barWidth <= 1 ? 0 : i / (barWidth - 1);
    ctx.fillStyle = rgbaToCss(interp(t));
    ctx.fillRect(barX + i, barY, 1, barHeight);
  }

  ctx.strokeStyle = tokens.color.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, barY + 0.5, Math.max(0, barWidth - 1), Math.max(0, barHeight - 1));

  const labelTop = barY + barHeight + 3;
  addOverlayText(surface, tokens, {
    left: barX,
    top: labelTop,
    text: formatValue(min, spec.encoding.color.format),
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
  });
  addOverlayText(surface, tokens, {
    left: barX + barWidth,
    top: labelTop,
    text: formatValue(max, spec.encoding.color.format),
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
    transform: 'translateX(-100%)',
  });
}

export function drawHeatmap(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  const heatmap = spec as HeatmapSpec;
  const emphasis = context?.emphasis ?? null;
  const content = drawTitleBlock(surface, tokens, size, heatmap.title);
  const rows = heatmap.data ?? [];
  const { x, y, color } = heatmap.encoding;
  const xCats = uniqueStrings(rows, x.field);
  const yCats = uniqueStrings(rows, y.field);
  const colorDomain = heatmapColorDomain(rows, color.field);

  if (xCats.length === 0 || yCats.length === 0 || !colorDomain || content.width <= 0 || content.height <= 0) return;

  const labelSize = tokens.font.size.small;
  const labelFont = fontString(labelSize, tokens.font.family, tokens.font.weight.normal);
  const yLabelWidth = measureMax(yCats, labelFont);
  const leftGutter = Math.ceil(clamp(yLabelWidth + tokens.spacing.sm, 28, Math.min(110, content.width * 0.32)));
  const xLabelHeight = Math.ceil(labelSize * 1.7);
  const legendHeight = Math.ceil(labelSize + 24);
  const gridTop = content.y + Math.min(tokens.spacing.xs, CHROME_PAD.top);
  const grid: Rect = {
    x: content.x + leftGutter,
    y: gridTop,
    width: Math.max(0, content.width - leftGutter),
    height: Math.max(0, content.y + content.height - gridTop - xLabelHeight - legendHeight - tokens.spacing.sm),
  };

  if (grid.width < MIN_GRID_SIZE || grid.height < MIN_GRID_SIZE) return;

  const xScale = bandScale({ domain: xCats, range: [grid.x, grid.x + grid.width], paddingInner: 0.06, paddingOuter: 0.02 });
  const yScale = bandScale({ domain: yCats, range: [grid.y, grid.y + grid.height], paddingInner: 0.06, paddingOuter: 0.02 });
  const interp = sequential(heatmap.scheme ?? 'teal');
  const cscale = sequentialColorScale({ domain: colorDomain, interpolator: interp });
  const readX = accessor(x.field);
  const readY = accessor(y.field);
  const readColor = accessor(color.field);
  const ctx = surface.marks.ctx;
  const cellRadius = Math.min(2, tokens.radius.sm);
  const cellValue = new Map<string, number>();
  const sketch = resolveSketch(spec);
  const pen = sketch && xCats.length * yCats.length <= MAX_ROUGH_CELLS ? new RoughPen(ctx, sketch) : null;

  ctx.save();
  ctx.beginPath();
  ctx.rect(grid.x, grid.y, grid.width, grid.height);
  ctx.clip();

  for (const row of rows) {
    const value = toNumber(readColor(row));
    if (!finite(value)) continue;

    const xk = categoryKey(readX(row));
    const yk = categoryKey(readY(row));
    const sx = xScale.map(xk);
    const sy = yScale.map(yk);
    if (sx === undefined || sy === undefined) continue;

    cellValue.set(`${xk}\u0000${yk}`, value);
    const fill = rgbaToCss(cscale.map(value));
    const alpha = rowAlpha(emphasis, row);
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (pen) {
      pen.rect(sx, sy, xScale.bandwidth, yScale.bandwidth, { fill, fillStyle: 'solid' });
    } else {
      ctx.fillStyle = fill;
      drawRoundedCell(ctx, sx, sy, xScale.bandwidth, yScale.bandwidth, cellRadius);
    }
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  ctx.restore();

  if (pen) {
    pen.rect(grid.x, grid.y, grid.width, grid.height, {
      stroke: tokens.color.border,
      roughness: sketch!.roughness * 0.6,
    });
  } else {
    ctx.strokeStyle = tokens.color.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(grid.x + 0.5, grid.y + 0.5, Math.max(0, grid.width - 1), Math.max(0, grid.height - 1));
  }

  for (const cat of yCats) {
    const sy = yScale.map(cat);
    if (sy === undefined) continue;
    addOverlayText(surface, tokens, {
      left: content.x,
      top: sy + yScale.bandwidth / 2,
      width: Math.max(0, leftGutter - tokens.spacing.sm),
      text: cat,
      color: tokens.color.textMuted,
      size: labelSize,
      align: 'right',
      transform: 'translateY(-50%)',
    });
  }

  const widestX = measureMax(xCats, labelFont);
  const every = Math.max(1, Math.ceil((widestX + tokens.spacing.md) / Math.max(1, xScale.step)));
  const xLabelTop = grid.y + grid.height + 6;
  xCats.forEach((cat, index) => {
    if (index % every !== 0) return;
    const sx = xScale.map(cat);
    if (sx === undefined) return;
    addOverlayText(surface, tokens, {
      left: sx + xScale.bandwidth / 2,
      top: xLabelTop,
      text: cat,
      color: tokens.color.textMuted,
      size: labelSize,
      transform: 'translateX(-50%)',
    });
  });

  drawLegend(
    surface,
    tokens,
    {
      x: grid.x,
      y: grid.y + grid.height + xLabelHeight + tokens.spacing.xs,
      width: grid.width,
      height: legendHeight,
    },
    colorDomain[0],
    colorDomain[1],
    heatmap,
  );

  const tt = heatmap.tooltip;
  if (tt === false || (tt && typeof tt === 'object' && tt.show === false)) return;

  const bw = xScale.bandwidth;
  const bh = yScale.bandwidth;
  const xPos = xCats.map((cat) => ({ cat, s: xScale.map(cat) })).filter((p) => p.s !== undefined) as { cat: string; s: number }[];
  const yPos = yCats.map((cat) => ({ cat, s: yScale.map(cat) })).filter((p) => p.s !== undefined) as { cat: string; s: number }[];
  const colorLabel = color.title ?? color.field;

  return {
    region: grid,
    hitTest: (px, py) => {
      const xc = xPos.find((p) => px >= p.s && px <= p.s + bw);
      const yc = yPos.find((p) => py >= p.s && py <= p.s + bh);
      if (!xc || !yc) return null;
      const value = cellValue.get(`${xc.cat}\u0000${yc.cat}`);
      if (value === undefined) return null;
      return {
        key: `${xc.cat}\u0000${yc.cat}`,
        anchorX: xc.s + bw / 2,
        anchorY: yc.s + bh / 2,
        content: {
          title: `${xc.cat} · ${yc.cat}`,
          rows: [
            { swatch: rgbaToCss(cscale.map(value)), label: colorLabel, value: formatValue(value, color.format) },
          ],
        },
        draw: (ictx) => {
          ictx.save();
          ictx.beginPath();
          roundedRect(ictx, xc.s, yc.s, bw, bh, cellRadius);
          ictx.lineWidth = 3;
          ictx.strokeStyle = tokens.color.background;
          ictx.stroke();
          ictx.beginPath();
          roundedRect(ictx, xc.s, yc.s, bw, bh, cellRadius);
          ictx.lineWidth = 1.5;
          ictx.strokeStyle = tokens.color.text;
          ictx.stroke();
          ictx.restore();
        },
      };
    },
    pick: (px, py) => {
      const xc = xPos.find((p) => px >= p.s && px <= p.s + bw);
      const yc = yPos.find((p) => py >= p.s && py <= p.s + bh);
      if (!xc || !yc) return null;
      if (cellValue.get(`${xc.cat}\u0000${yc.cat}`) === undefined) return null;
      return { kind: 'point', fields: [x.field, y.field], tuples: [[xc.cat, yc.cat]] };
    },
  };
}
