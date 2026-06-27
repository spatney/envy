import { ordinalColorScale, parseColor, readableTextColor, rgbaToCss } from '../color';
import { formatValue } from '../format';
import type { Surface } from '../render/surface';
import { arc } from '../shape';
import { RoughPen } from '../rough';
import { resolveSketch } from '../spec/sketch';
import type { ChartSpec, PieSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { RGBA, Size } from '../types';
import { accessor, toKey, toNumber } from '../util/data';
import { aggregateValues } from '../pivot';
import type { InteractionModel } from '../interaction/types';
import type { RenderContext } from './index';
import {
  addOverlayText,
  CHROME_PAD,
  drawCategoricalLegend,
  drawTitleBlock,
  type LegendEntry,
} from './chrome';
import { fontString, measureText } from '../render/text';
import { planPieLabels, type PieLabelContent } from './pieLabels';

const TAU = Math.PI * 2;

interface PieSlice {
  key: string;
  label: string;
  value: number;
  color: string;
  rgba: RGBA;
  /** The raw color-field value backing this slice (for selection identity). */
  category: unknown;
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
  const op = spec.encoding.theta.aggregate ?? 'sum';
  const rows = spec.data ?? [];

  // Aggregate theta by color category (first-seen order) so repeated categories
  // collapse into one slice — the expected BI behavior for a share chart.
  const order: string[] = [];
  const groups = new Map<string, { category: unknown; values: number[] }>();
  for (const row of rows) {
    const value = toNumber(readTheta(row));
    if (!Number.isFinite(value)) continue;
    const category = readColor(row);
    const key = toKey(category);
    let group = groups.get(key);
    if (!group) {
      group = { category, values: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.values.push(value);
  }

  const raw: Array<Omit<PieSlice, 'startAngle' | 'endAngle'>> = [];
  let total = 0;
  for (const key of order) {
    const group = groups.get(key)!;
    const value = aggregateValues(group.values, op) ?? 0;
    if (!Number.isFinite(value) || value <= 0) continue;
    const rgba = colorScale.map(key);
    raw.push({
      key,
      label: sliceLabel(group.category),
      value,
      color: rgbaToCss(rgba),
      rgba,
      category: group.category,
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

function pieTooltipEnabled(spec: PieSpec): boolean {
  const tt = spec.tooltip;
  if (tt === false) return false;
  if (tt && typeof tt === 'object' && tt.show === false) return false;
  return true;
}

interface ResolvedPieLabels {
  placement: 'inside' | 'outside' | 'auto';
  content?: PieLabelContent;
  minShare: number;
  connector: 'slice' | 'muted';
}

/** Normalise `spec.labels` (boolean | PieLabels) into a config, or null to hide. */
function resolvePieLabels(spec: PieSpec): ResolvedPieLabels | null {
  const l = spec.labels;
  if (l === false) return null;
  if (l && typeof l === 'object') {
    if (l.show === false) return null;
    return {
      placement: l.placement ?? 'auto',
      content: l.content,
      minShare: typeof l.minShare === 'number' ? l.minShare : 0.01,
      connector: l.connector ?? 'slice',
    };
  }
  return { placement: 'auto', minShare: 0.01, connector: 'slice' };
}

export function drawPie(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  const pie = spec as PieSpec;
  const ctx = surface.marks.ctx;
  const colorField = pie.encoding.color.field;
  const emphasis = context?.emphasis ?? null;
  const sliceAlpha = (slice: PieSlice): number =>
    emphasis ? (emphasis.match({ [colorField]: slice.category }) ? 1 : emphasis.dim) : 1;
  const content = drawTitleBlock(surface, tokens, size, pie.title);
  const slices = buildSlices(pie, tokens.color.palette);
  const legendPosition = resolveLegendPosition(pie, content.width, content.height);
  const area = legendPosition
    ? drawCategoricalLegend(surface, tokens, content, uniqueLegendEntries(slices), legendPosition)
    : content;

  const initialCx = area.x + area.width / 2;
  const initialCy = area.y + area.height / 2;
  const initialOuterR = Math.max(0, (Math.min(area.width, area.height) / 2) * 0.92);
  const donutRatio =
    pie.donut === true ? 0.6 : typeof pie.donut === 'number' ? clamp(pie.donut, 0, 0.95) : 0;
  const initialInnerR = initialOuterR * donutRatio;
  const total = totalOf(slices);
  const separator = parseColor(tokens.color.background) ? tokens.color.background : tokens.color.border;

  if (slices.length === 0 || total <= 0 || initialOuterR <= 0) {
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

  const labelCfg = resolvePieLabels(pie);
  const labelFont = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.normal);
  const labelPlan =
    labelCfg &&
    planPieLabels({
      slices: slices.map((s, i) => ({
        index: i,
        label: s.label,
        value: s.value,
        share: s.value / total,
        startAngle: s.startAngle,
        endAngle: s.endAngle,
      })),
      cx: initialCx,
      cy: initialCy,
      outerR: initialOuterR,
      innerR: initialInnerR,
      area: { x: area.x, y: area.y, width: area.width, height: area.height },
      placement: labelCfg.placement,
      content: labelCfg.content,
      minShare: labelCfg.minShare,
      lineHeight: Math.round(tokens.font.size.small * 1.5),
      measure: (t) => measureText(t, labelFont).width,
      formatValue: (v) => formatValue(v, pie.encoding.theta.format),
    });

  const cx = labelPlan ? labelPlan.cx : initialCx;
  const cy = labelPlan ? labelPlan.cy : initialCy;
  const outerRadius = labelPlan ? labelPlan.outerR : initialOuterR;
  const innerRadius = labelPlan ? labelPlan.innerR : initialInnerR;

  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = separator;

  const sketch = resolveSketch(spec);
  if (sketch) {
    const pen = new RoughPen(ctx, sketch);
    for (const slice of slices) {
      const alpha = sliceAlpha(slice);
      if (alpha !== 1) ctx.globalAlpha = alpha;
      pen.wedge(cx, cy, innerRadius, outerRadius, slice.startAngle, slice.endAngle, {
        fill: slice.color,
        stroke: separator,
      });
      if (alpha !== 1) ctx.globalAlpha = 1;
    }
    ctx.restore();
  } else {
    for (const slice of slices) {
      const wedge = arc({
        innerRadius,
        outerRadius,
        startAngle: slice.startAngle,
        endAngle: slice.endAngle,
      });
      ctx.beginPath();
      wedge(ctx, cx, cy);
      ctx.globalAlpha = sliceAlpha(slice);
      ctx.fillStyle = slice.color;
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  if (labelPlan && labelCfg) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const o of labelPlan.outside) {
      const slice = slices[o.index];
      ctx.globalAlpha = sliceAlpha(slice);
      ctx.strokeStyle = labelCfg.connector === 'muted' ? tokens.color.border : slice.color;
      ctx.beginPath();
      o.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    for (const o of labelPlan.outside) {
      const alpha = sliceAlpha(slices[o.index]);
      addOverlayText(surface, tokens, {
        left: o.x,
        top: o.y,
        text: o.text,
        color: tokens.color.text,
        size: tokens.font.size.small,
        transform: o.align === 'right' ? 'translate(-100%,-50%)' : 'translateY(-50%)',
        opacity: alpha === 1 ? undefined : alpha,
      });
    }

    for (const l of labelPlan.inside) {
      const slice = slices[l.index];
      const alpha = sliceAlpha(slice);
      addOverlayText(surface, tokens, {
        left: l.x,
        top: l.y,
        text: l.text,
        color: rgbaToCss(readableTextColor(slice.rgba)),
        size: tokens.font.size.small,
        weight: tokens.font.weight.bold,
        transform: 'translate(-50%,-50%)',
        opacity: alpha === 1 ? undefined : alpha,
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

  if (!pieTooltipEnabled(pie)) return;

  const measureLabel = pie.encoding.theta.title ?? pie.encoding.theta.field;
  const region = { x: area.x, y: area.y, width: area.width, height: area.height };

  return {
    region,
    hitTest: (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      const r = Math.hypot(dx, dy);
      if (r < innerRadius || r > outerRadius) return null;
      let theta = Math.atan2(dx, -dy);
      if (theta < 0) theta += TAU;
      const slice = slices.find((s) => theta >= s.startAngle && theta < s.endAngle);
      if (!slice) return null;
      const share = slice.value / total;
      return {
        key: slice.key,
        anchorX: px,
        anchorY: py,
        content: {
          title: slice.label,
          rows: [
            { swatch: slice.color, label: measureLabel, value: formatValue(slice.value, pie.encoding.theta.format) },
            { label: 'Share', value: `${(share * 100).toFixed(1)}%`, muted: true },
          ],
        },
        draw: (ictx) => {
          const wedge = arc({
            innerRadius,
            outerRadius: outerRadius + 5,
            startAngle: slice.startAngle,
            endAngle: slice.endAngle,
          });
          ictx.save();
          ictx.beginPath();
          wedge(ictx, cx, cy);
          ictx.fillStyle = slice.color;
          ictx.fill();
          ictx.lineWidth = 1.5;
          ictx.strokeStyle = separator;
          ictx.stroke();
          ictx.restore();
        },
      };
    },
    pick: (px, py) => {
      const dx = px - cx;
      const dy = py - cy;
      const r = Math.hypot(dx, dy);
      if (r < innerRadius || r > outerRadius) return null;
      let theta = Math.atan2(dx, -dy);
      if (theta < 0) theta += TAU;
      const slice = slices.find((s) => theta >= s.startAngle && theta < s.endAngle);
      if (!slice) return null;
      return { kind: 'point', fields: [colorField], tuples: [[slice.category]] };
    },
  };
}
