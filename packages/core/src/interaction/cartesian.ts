/**
 * Cartesian hit-testing.
 *
 * Builds an `InteractionModel` from a resolved `CartesianModel`:
 *   - line / area / bar / point-x  → shared-x "index" hover (crosshair + one
 *     tooltip row per series at the focused x).
 *   - scatter (quantitative x)      → nearest-point hover (focus ring).
 *
 * All highlight drawing targets the interaction canvas in CSS px; nothing here
 * mutates the marks layer, so hover never triggers a full redraw.
 */

import type { Rect } from '../types';
import type { CartesianModel } from '../runtime/cartesian';
import { accessor, toKey, toNumber } from '../util/data';
import { formatValue } from '../format';
import { withAlpha } from '../color';
import type { Hover, InteractionModel, TooltipRow } from './types';

const HIT_RADIUS = 26; // scatter nearest-point pickup radius (px)

export function tooltipEnabled(spec: CartesianModel['spec']): boolean {
  const tt = spec.tooltip;
  if (tt === false) return false;
  if (tt && typeof tt === 'object' && tt.show === false) return false;
  return true;
}

export function buildCartesianInteraction(model: CartesianModel): InteractionModel | null {
  if (!tooltipEnabled(model.spec)) return null;
  if (model.series.length === 0) return null;
  if (model.spec.type === 'scatter') return scatterInteraction(model);
  return indexInteraction(model);
}

function inside(r: Rect, px: number, py: number, pad = 0): boolean {
  return (
    px >= r.x - pad &&
    px <= r.x + r.width + pad &&
    py >= r.y - pad &&
    py <= r.y + r.height + pad
  );
}

/* ------------------------------------------------------------------ */
/* Shared-x index hover (line / area / bar / point)                    */
/* ------------------------------------------------------------------ */

interface Stop {
  key: string;
  value: unknown;
  px: number;
}

interface SeriesLookup {
  key: string;
  label: string;
  color: string;
  /** xKey → raw y value. */
  byX: Map<string, number>;
}

function indexInteraction(model: CartesianModel): InteractionModel | null {
  const { plot, x, y, series } = model;
  const xField = x.field;
  const yField = y.field ?? model.spec.encoding.y.field;
  const readX = accessor(xField);
  const readY = accessor(yField);
  const xFormat = model.spec.encoding.x?.format;
  const yFormat = model.spec.encoding.y?.format;
  const band = x.kind === 'band';
  const showDots = !model.stacked && !band;

  const stopByKey = new Map<string, Stop>();
  const lookups: SeriesLookup[] = [];

  for (const s of series) {
    const byX = new Map<string, number>();
    for (const row of s.rows) {
      const xv = readX(row);
      const k = toKey(xv);
      const yv = toNumber(readY(row));
      if (!Number.isNaN(yv)) byX.set(k, yv);
      if (!stopByKey.has(k)) {
        const px = x.pixel(xv);
        if (px != null) stopByKey.set(k, { key: k, value: xv, px });
      }
    }
    lookups.push({ key: s.key, label: s.label, color: s.color, byX });
  }

  const stops = [...stopByKey.values()].sort((a, b) => a.px - b.px);
  if (stops.length === 0) return null;
  const multi = series.length > 1;

  const hitTest = (px: number, py: number): Hover | null => {
    if (!inside(plot, px, py, 6)) return null;

    let best = stops[0];
    let bestDist = Math.abs(px - best.px);
    for (let i = 1; i < stops.length; i++) {
      const d = Math.abs(px - stops[i].px);
      if (d < bestDist) {
        bestDist = d;
        best = stops[i];
      }
    }

    const rows: TooltipRow[] = [];
    const dots: { py: number; color: string }[] = [];
    let nearestDy = Infinity;
    let nearestIdx = -1;

    for (const lk of lookups) {
      const raw = lk.byX.get(best.key);
      if (raw == null) continue;
      const dotY = y.pixel(raw);
      if (showDots) {
        const dy = Math.abs(dotY - py);
        if (dy < nearestDy) {
          nearestDy = dy;
          nearestIdx = rows.length;
        }
        dots.push({ py: dotY, color: lk.color });
      }
      rows.push({
        swatch: lk.color,
        label: multi ? lk.label : (model.spec.encoding.y.title ?? yField),
        value: formatValue(raw, yFormat),
      });
    }

    if (rows.length === 0) return null;
    if (nearestIdx >= 0) rows[nearestIdx].strong = true;

    const anchorY = showDots && nearestIdx >= 0 ? dots[nearestIdx].py : py;

    return {
      key: best.key,
      anchorX: best.px,
      anchorY,
      content: { title: formatValue(best.value, xFormat), rows },
      draw: (ctx) => {
        ctx.save();
        // Crosshair / category band.
        if (band) {
          const half = x.bandwidth / 2;
          ctx.fillStyle = withAlpha(model.tokens.color.text, 0.06);
          ctx.fillRect(best.px - half, plot.y, x.bandwidth, plot.height);
        } else {
          ctx.strokeStyle = withAlpha(model.tokens.color.text, 0.28);
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.moveTo(Math.round(best.px) + 0.5, plot.y);
          ctx.lineTo(Math.round(best.px) + 0.5, plot.y + plot.height);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // Focus dots.
        for (let i = 0; i < dots.length; i++) {
          const d = dots[i];
          const strong = i === nearestIdx;
          ctx.beginPath();
          ctx.fillStyle = model.tokens.color.background;
          ctx.arc(best.px, d.py, strong ? 6 : 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = d.color;
          ctx.arc(best.px, d.py, strong ? 4 : 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      },
    };
  };

  return { region: plot, hitTest };
}

/* ------------------------------------------------------------------ */
/* Scatter nearest-point hover                                         */
/* ------------------------------------------------------------------ */

interface ScatterPoint {
  px: number;
  py: number;
  color: string;
  seriesLabel: string;
  xVal: unknown;
  yVal: unknown;
  sizeVal?: unknown;
}

function scatterInteraction(model: CartesianModel): InteractionModel | null {
  const { plot, x, y, series } = model;
  const xField = x.field;
  const yField = y.field ?? model.spec.encoding.y.field;
  const readX = accessor(xField);
  const readY = accessor(yField);
  const sizeField = model.spec.encoding.size?.field;
  const readSize = sizeField ? accessor(sizeField) : null;
  const xFormat = model.spec.encoding.x?.format;
  const yFormat = model.spec.encoding.y?.format;
  const sizeFormat = model.spec.encoding.size?.format;
  const multi = series.length > 1;

  const points: ScatterPoint[] = [];
  for (const s of series) {
    for (const row of s.rows) {
      const xv = readX(row);
      const yv = readY(row);
      const px = x.pixel(xv);
      const py = y.pixel(yv);
      if (px == null || Number.isNaN(py)) continue;
      points.push({
        px,
        py,
        color: s.color,
        seriesLabel: s.label,
        xVal: xv,
        yVal: yv,
        sizeVal: readSize ? readSize(row) : undefined,
      });
    }
  }
  if (points.length === 0) return null;

  const hitTest = (px: number, py: number): Hover | null => {
    if (!inside(plot, px, py, HIT_RADIUS)) return null;
    let best = -1;
    let bestSq = HIT_RADIUS * HIT_RADIUS;
    for (let i = 0; i < points.length; i++) {
      const dx = points[i].px - px;
      const dy = points[i].py - py;
      const sq = dx * dx + dy * dy;
      if (sq <= bestSq) {
        bestSq = sq;
        best = i;
      }
    }
    if (best < 0) return null;
    const p = points[best];

    const rows: TooltipRow[] = [
      { swatch: p.color, label: model.spec.encoding.x?.title ?? xField, value: formatValue(p.xVal, xFormat) },
      { label: model.spec.encoding.y.title ?? yField, value: formatValue(p.yVal, yFormat) },
    ];
    if (sizeField && p.sizeVal != null) {
      rows.push({
        label: model.spec.encoding.size?.title ?? sizeField,
        value: formatValue(p.sizeVal, sizeFormat),
        muted: true,
      });
    }

    return {
      key: `${best}`,
      anchorX: p.px,
      anchorY: p.py,
      content: { title: multi ? p.seriesLabel : undefined, rows },
      draw: (ctx) => {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = model.tokens.color.background;
        ctx.lineWidth = 3;
        ctx.arc(p.px, p.py, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.arc(p.px, p.py, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      },
    };
  };

  return { region: plot, hitTest };
}
