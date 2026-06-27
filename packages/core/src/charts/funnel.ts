import { ordinalColorScale, rgbaToCss } from '../color';
import { formatValue } from '../format';
import type { Surface } from '../render/surface';
import { fontString, measureText } from '../render/text';
import { RoughPen } from '../rough';
import { resolveSketch } from '../spec/sketch';
import type { ChartSpec, FunnelSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Point, RGBA, Size } from '../types';
import { accessor, toKey, toNumber } from '../util/data';
import type { InteractionModel } from '../interaction/types';
import type { RenderContext } from './index';
import { addOverlayText, CHROME_PAD, drawTitleBlock } from './chrome';

interface Stage {
  key: string;
  label: string;
  value: number;
  category: unknown;
  color: string;
  rgba: RGBA;
}

/** Aggregate (sum) value by stage, preserving first-seen order. */
function buildStages(spec: FunnelSpec, palette: string[]): Stage[] {
  const readStage = accessor(spec.encoding.stage.field);
  const readValue = accessor(spec.encoding.value.field);
  const colorScale = ordinalColorScale({ palette });
  const order: string[] = [];
  const totals = new Map<string, { category: unknown; value: number }>();

  for (const row of spec.data ?? []) {
    const category = readStage(row);
    const key = toKey(category);
    const value = toNumber(readValue(row));
    if (!Number.isFinite(value)) continue;
    const cur = totals.get(key);
    if (cur) cur.value += value;
    else {
      totals.set(key, { category, value });
      order.push(key);
    }
  }

  return order.map((key) => {
    const { category, value } = totals.get(key)!;
    const rgba = colorScale.map(key);
    return {
      key,
      label: key === '' ? '(blank)' : key,
      value,
      category,
      color: rgbaToCss(rgba),
      rgba,
    };
  });
}

export function drawFunnel(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  const funnel = spec as FunnelSpec;
  const ctx = surface.marks.ctx;
  const stageField = funnel.encoding.stage.field;
  const valueFormat = funnel.encoding.value.format;
  const showLabels = funnel.labels !== false;
  const mode = funnel.percent === 'previous' ? 'previous' : 'first';
  const emphasis = context?.emphasis ?? null;

  const content = drawTitleBlock(surface, tokens, size, funnel.title);
  const stages = buildStages(funnel, tokens.color.palette);
  const maxValue = stages.reduce((m, s) => Math.max(m, s.value), 0);

  if (stages.length === 0 || maxValue <= 0 || content.width <= 0 || content.height <= 0) {
    addOverlayText(surface, tokens, {
      left: content.x,
      top: content.y + Math.max(CHROME_PAD.top, content.height / 2 - tokens.font.size.small / 2),
      width: content.width,
      text: 'No positive values',
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      align: 'center',
    });
    return;
  }

  // Left gutter holds the stage name + value (like a category axis).
  const labelFont = fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.bold);
  let labelW = 0;
  if (showLabels) {
    for (const s of stages) labelW = Math.max(labelW, measureText(s.label, labelFont).width);
    labelW = Math.min(content.width * 0.34, labelW + 14);
  }

  const funnelX = content.x + labelW;
  const funnelW = content.width - labelW;
  const cx = funnelX + funnelW / 2;
  const n = stages.length;
  const gap = Math.min(6, Math.max(2, content.height / n / 12));
  const bandH = content.height / n;
  const widthOf = (v: number): number => (v / maxValue) * funnelW;

  const alphaOf = (s: Stage): number =>
    emphasis ? (emphasis.match({ [stageField]: s.category }) ? 1 : emphasis.dim) : 1;
  const pctOf = (i: number): number => {
    if (mode === 'previous') return i === 0 ? 1 : stages[i].value / stages[i - 1].value;
    return stages[i].value / stages[0].value;
  };

  const sketch = resolveSketch(spec);
  const pen = sketch ? new RoughPen(ctx, sketch) : null;
  const bands: { top: number; bottom: number; topHalf: number; botHalf: number }[] = [];

  ctx.save();
  for (let i = 0; i < n; i++) {
    const s = stages[i];
    const top = content.y + i * bandH + gap / 2;
    const bottom = content.y + (i + 1) * bandH - gap / 2;
    const topHalf = widthOf(s.value) / 2;
    const nextValue = i < n - 1 ? stages[i + 1].value : s.value;
    const botHalf = widthOf(nextValue) / 2;
    bands.push({ top, bottom, topHalf, botHalf });

    const pts: Point[] = [
      { x: cx - topHalf, y: top },
      { x: cx + topHalf, y: top },
      { x: cx + botHalf, y: bottom },
      { x: cx - botHalf, y: bottom },
    ];

    ctx.globalAlpha = alphaOf(s);
    if (pen) {
      pen.polygon(pts, { fill: s.color, stroke: s.color });
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  const halfAtY = (band: { top: number; bottom: number; topHalf: number; botHalf: number }, y: number): number => {
    const t = band.bottom === band.top ? 0 : (y - band.top) / (band.bottom - band.top);
    return band.topHalf + (band.botHalf - band.topHalf) * t;
  };

  if (showLabels) {
    for (let i = 0; i < n; i++) {
      const s = stages[i];
      const band = bands[i];
      const midY = (band.top + band.bottom) / 2;
      const dim = alphaOf(s) !== 1;

      // Stage name + value in the left gutter.
      addOverlayText(surface, tokens, {
        left: content.x,
        top: midY - tokens.font.size.small,
        text: s.label,
        color: tokens.color.text,
        size: tokens.font.size.small,
        weight: tokens.font.weight.bold,
        opacity: dim ? 0.5 : 1,
      });
      addOverlayText(surface, tokens, {
        left: content.x,
        top: midY + 2,
        text: formatValue(s.value, valueFormat),
        color: tokens.color.textMuted,
        size: tokens.font.size.tiny,
        opacity: dim ? 0.5 : 1,
      });

      // Retained % in a themed pill so it reads identically on every fill. When
      // the pill is wider than the segment at this row, place it just outside to
      // the right instead of letting the text spill over the narrow band.
      const pct = pctOf(i);
      const pctText = `${Math.round(pct * 100)}%`;
      const padX = 7;
      const badgeW = Math.ceil(measureText(pctText, labelFont).width) + padX * 2 + 2;
      const innerHalf = halfAtY(band, midY);
      const fitsInside = badgeW + 8 <= innerHalf * 2;
      let badgeLeft = cx;
      let badgeTransform = 'translate(-50%,-50%)';
      if (!fitsInside) {
        badgeLeft = cx + innerHalf + 6;
        const maxLeft = content.x + content.width - badgeW;
        if (badgeLeft > maxLeft) badgeLeft = maxLeft;
        badgeTransform = 'translate(0,-50%)';
      }
      addOverlayText(surface, tokens, {
        left: badgeLeft,
        top: midY,
        text: pctText,
        color: tokens.color.text,
        size: tokens.font.size.small,
        weight: tokens.font.weight.bold,
        opacity: dim ? 0.55 : 1,
        transform: badgeTransform,
        pill: { background: tokens.color.surface, border: tokens.color.border, padX },
      });
    }
  }

  const measureLabel = funnel.encoding.value.title ?? funnel.encoding.value.field;
  const hitIndex = (px: number, py: number): number => {
    for (let i = 0; i < n; i++) {
      const b = bands[i];
      if (py < b.top || py > b.bottom) continue;
      if (Math.abs(px - cx) <= halfAtY(b, py)) return i;
    }
    return -1;
  };

  return {
    region: { x: content.x, y: content.y, width: content.width, height: content.height },
    hitTest: (px, py) => {
      const i = hitIndex(px, py);
      if (i < 0) return null;
      const s = stages[i];
      return {
        key: s.key,
        anchorX: px,
        anchorY: py,
        content: {
          title: s.label,
          rows: [
            { swatch: s.color, label: measureLabel, value: formatValue(s.value, valueFormat) },
            { label: mode === 'previous' ? 'vs previous' : 'vs first', value: `${(pctOf(i) * 100).toFixed(1)}%`, muted: true },
          ],
        },
      };
    },
    pick: (px, py) => {
      const i = hitIndex(px, py);
      if (i < 0) return null;
      return { kind: 'point', fields: [stageField], tuples: [[stages[i].category]] };
    },
  };
}
