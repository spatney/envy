import { ordinalColorScale, parseColor, readableTextColor, rgbaToCss } from '../color';
import { formatValue } from '../format';
import type { Surface } from '../render/surface';
import { arc } from '../shape';
import type { ChartSpec, PieSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { RGBA, Size } from '../types';
import { accessor, toKey, toNumber } from '../util/data';
import {
  addOverlayText,
  CHROME_PAD,
  drawCategoricalLegend,
  drawTitleBlock,
  type LegendEntry,
} from './chrome';

const TAU = Math.PI * 2;
const MIN_LABEL_SHARE = 0.06;

interface PieSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  rgba: RGBA;
  startAngle: number;
  endAngle: number;
}

type LegendPosition = 'top' | 'right' | 'bottom';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveLegendPosition(spec: PieSpec, width: number, height: number): LegendPosition | null {
  if (spec.legend === false) return null;
  if (spec.legend && typeof spec.legend === 'object' && spec.legend.show === false) return null;

  const requested = spec.legend && typeof spec.legend === 'object' ? spec.legend.position : undefined;
  if (requested === 'top' || requested === 'bottom' || requested === 'right') return requested;

  return height > 0 && width / height > 2.2 ? 'bottom' : 'right';
}

function sliceLabel(value: unknown): string {
  const key = toKey(value);
  return key === '' ? '(blank)' : key;
}

function buildSlices(spec: PieSpec, palette: string[]): PieSlice[] {
  const readTheta = accessor(spec.encoding.theta.field);
  const readColor = accessor(spec.encoding.color.field);
  const colorScale = ordinalColorScale({ palette });
  const rows = spec.data ?? [];
  const raw: Array<Omit<PieSlice, 'startAngle' | 'endAngle'>> = [];
  let total = 0;

  for (const row of rows) {
    const value = toNumber(readTheta(row));
    if (!Number.isFinite(value) || value <= 0) continue;

    const category = readColor(row);
    const key = toKey(category);
    const rgba = colorScale.map(key);
    raw.push({
      key,
      label: sliceLabel(category),
      value,
      color: rgbaToCss(rgba),
      rgba,
    });
    total += value;
  }

  let angle = 0;
  return raw.map((s, i) => {
    const endAngle = i === raw.length - 1 ? TAU : angle + (s.value / total) * TAU;
    const slice = { ...s, startAngle: angle, endAngle };
    angle = endAngle;
    return slice;
  });
}

function uniqueLegendEntries(slices: readonly PieSlice[]): LegendEntry[] {
  const seen = new Set<string>();
  const entries: LegendEntry[] = [];
  for (const slice of slices) {
    if (seen.has(slice.key)) continue;
    seen.add(slice.key);
    entries.push({ label: slice.label, color: slice.color, symbol: 'square' });
  }
  return entries;
}

function totalOf(slices: readonly PieSlice[]): number {
  return slices.reduce((sum, slice) => sum + slice.value, 0);
}

export function drawPie(surface: Surface, spec: ChartSpec, tokens: ThemeTokens, size: Size): void {
  const pie = spec as PieSpec;
  const ctx = surface.marks.ctx;
  const content = drawTitleBlock(surface, tokens, size, pie.title);
  const slices = buildSlices(pie, tokens.color.palette);
  const legendPosition = resolveLegendPosition(pie, content.width, content.height);
  const area = legendPosition
    ? drawCategoricalLegend(surface, tokens, content, uniqueLegendEntries(slices), legendPosition)
    : content;

  const cx = area.x + area.width / 2;
  const cy = area.y + area.height / 2;
  const outerRadius = Math.max(0, (Math.min(area.width, area.height) / 2) * 0.92);
  const donutRatio =
    pie.donut === true ? 0.6 : typeof pie.donut === 'number' ? clamp(pie.donut, 0, 0.95) : 0;
  const innerRadius = outerRadius * donutRatio;
  const total = totalOf(slices);
  const separator = parseColor(tokens.color.background) ? tokens.color.background : tokens.color.border;

  if (slices.length === 0 || total <= 0 || outerRadius <= 0) {
    addOverlayText(surface, tokens, {
      left: area.x,
      top: area.y + Math.max(CHROME_PAD.top, area.height / 2 - tokens.font.size.small / 2),
      width: area.width,
      text: 'No positive values',
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      align: 'center',
    });
    return;
  }

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = separator;

  for (const slice of slices) {
    const wedge = arc({
      innerRadius,
      outerRadius,
      startAngle: slice.startAngle,
      endAngle: slice.endAngle,
    });
    ctx.beginPath();
    wedge(ctx, cx, cy);
    ctx.fillStyle = slice.color;
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();

  if (pie.labels !== false) {
    const labelRadius = innerRadius > 0 ? (innerRadius + outerRadius) / 2 : outerRadius * 0.62;
    for (const slice of slices) {
      const share = slice.value / total;
      if (share < MIN_LABEL_SHARE) continue;
      const mid = (slice.startAngle + slice.endAngle) / 2;
      const x = cx + labelRadius * Math.cos(mid - Math.PI / 2);
      const y = cy + labelRadius * Math.sin(mid - Math.PI / 2);
      addOverlayText(surface, tokens, {
        left: x,
        top: y,
        text: `${Math.round(share * 100)}%`,
        color: rgbaToCss(readableTextColor(slice.rgba)),
        size: tokens.font.size.small,
        weight: tokens.font.weight.bold,
        transform: 'translate(-50%,-50%)',
      });
    }
  }

  if (innerRadius >= 34) {
    addOverlayText(surface, tokens, {
      left: cx,
      top: cy - tokens.font.size.small - 2,
      text: pie.encoding.theta.title ?? 'Total',
      color: tokens.color.textMuted,
      size: tokens.font.size.tiny,
      transform: 'translate(-50%,-50%)',
    });
    addOverlayText(surface, tokens, {
      left: cx,
      top: cy + tokens.font.size.base / 2,
      text: formatValue(total, pie.encoding.theta.format),
      color: tokens.color.text,
      size: tokens.font.size.large,
      weight: tokens.font.weight.bold,
      transform: 'translate(-50%,-50%)',
    });
  }
}
