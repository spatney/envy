import type { Surface } from '../render/surface';
import type { CartesianModel } from '../runtime/cartesian';
import type { BoxSpec } from '../spec/types';
import { withAlpha } from '../color';
import { formatValue } from '../format';
import { roundedRect } from '../shape';
import { accessor, toKey, toNumber } from '../util/data';
import type { InteractionModel, TooltipRow } from '../interaction/types';

interface BoxStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  outliers: number[];
  count: number;
}

interface BoxGeom {
  key: string;
  title: string;
  color: string;
  cx: number;
  boxW: number;
  left: number;
  right: number;
  /** Vertical hit extent (whisker top to whisker bottom in px). */
  top: number;
  bottom: number;
  stats: BoxStats;
}

interface BoxLayout {
  geoms: BoxGeom[];
  showOutliers: boolean;
}

/** Type-7 (linear interpolation) quantile of a pre-sorted ascending array. */
function quantileSorted(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const frac = idx - lo;
  if (lo + 1 >= n) return sorted[n - 1];
  return sorted[lo] + (sorted[lo + 1] - sorted[lo]) * frac;
}

function computeStats(values: number[], whisker: 'tukey' | 'minMax'): BoxStats | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const q1 = quantileSorted(sorted, 0.25);
  const median = quantileSorted(sorted, 0.5);
  const q3 = quantileSorted(sorted, 0.75);
  const dataMin = sorted[0];
  const dataMax = sorted[sorted.length - 1];
  const outliers: number[] = [];
  let lo = dataMin;
  let hi = dataMax;

  if (whisker === 'tukey') {
    const iqr = q3 - q1;
    const fenceLo = q1 - 1.5 * iqr;
    const fenceHi = q3 + 1.5 * iqr;
    let wLo = Infinity;
    let wHi = -Infinity;
    for (const v of sorted) {
      if (v < fenceLo || v > fenceHi) {
        outliers.push(v);
        continue;
      }
      if (v < wLo) wLo = v;
      if (v > wHi) wHi = v;
    }
    lo = wLo === Infinity ? q1 : wLo;
    hi = wHi === -Infinity ? q3 : wHi;
  }

  return { min: lo, q1, median, q3, max: hi, outliers, count: sorted.length };
}

/** Resolve per-category (and per-series) box geometry without drawing. */
function computeBoxes(model: CartesianModel): BoxLayout | null {
  const spec = model.spec as BoxSpec;
  if (model.x.kind !== 'band' || model.x.bandwidth <= 0 || model.series.length === 0) return null;

  const whisker: 'tukey' | 'minMax' = spec.whisker === 'minMax' ? 'minMax' : 'tukey';
  const showOutliers = spec.outliers !== false && whisker === 'tukey';
  const readX = accessor(model.x.field);
  const readY = accessor(model.y.field ?? '');
  const seriesCount = model.series.length;
  const bandWidth = model.x.bandwidth;
  const subWidth = bandWidth / seriesCount;
  const gap = seriesCount > 1 ? Math.min(8, subWidth * 0.18) : 0;
  const boxW = Math.max(3, Math.min(subWidth - gap, 64));
  const grouped = seriesCount > 1;
  const yPix = (v: number): number => model.y.pixel(v);
  const geoms: BoxGeom[] = [];

  model.series.forEach((series, seriesIndex) => {
    const groups = new Map<string, { value: unknown; vals: number[] }>();
    for (const row of series.rows) {
      const xv = readX(row);
      const y = toNumber(readY(row));
      if (!Number.isFinite(y)) continue;
      const k = toKey(xv);
      let g = groups.get(k);
      if (!g) {
        g = { value: xv, vals: [] };
        groups.set(k, g);
      }
      g.vals.push(y);
    }

    for (const [k, g] of groups) {
      const cxRaw = model.x.pixel(g.value);
      if (cxRaw == null) continue;
      const stats = computeStats(g.vals, whisker);
      if (!stats) continue;
      const cx = cxRaw - bandWidth / 2 + (seriesIndex + 0.5) * subWidth;
      geoms.push({
        key: grouped ? `${k}\u0000${series.key}` : k,
        title: grouped ? `${k} · ${series.label}` : k,
        color: series.color,
        cx,
        boxW,
        left: cx - boxW / 2,
        right: cx + boxW / 2,
        top: Math.min(yPix(stats.max), yPix(stats.min)),
        bottom: Math.max(yPix(stats.max), yPix(stats.min)),
        stats,
      });
    }
  });

  return geoms.length ? { geoms, showOutliers } : null;
}

function drawOneBox(
  ctx: CanvasRenderingContext2D,
  model: CartesianModel,
  geom: BoxGeom,
  showOutliers: boolean,
): void {
  const yPix = (v: number): number => model.y.pixel(v);
  const { cx, left, right, boxW, stats, color } = geom;
  const capHalf = boxW * 0.28;
  const yQ1 = yPix(stats.q1);
  const yQ3 = yPix(stats.q3);
  const yMed = yPix(stats.median);
  const yLo = yPix(stats.min);
  const yHi = yPix(stats.max);
  const top = Math.min(yQ1, yQ3);
  const bottom = Math.max(yQ1, yQ3);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(cx, yHi);
  ctx.lineTo(cx, top);
  ctx.moveTo(cx, bottom);
  ctx.lineTo(cx, yLo);
  ctx.moveTo(cx - capHalf, yHi);
  ctx.lineTo(cx + capHalf, yHi);
  ctx.moveTo(cx - capHalf, yLo);
  ctx.lineTo(cx + capHalf, yLo);
  ctx.stroke();

  const h = Math.max(1, bottom - top);
  ctx.beginPath();
  roundedRect(ctx, left, top, boxW, h, Math.min(3, boxW / 4));
  ctx.fillStyle = withAlpha(color, 0.16);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(left, yMed);
  ctx.lineTo(right, yMed);
  ctx.lineWidth = 2;
  ctx.stroke();

  if (showOutliers && stats.outliers.length) {
    ctx.fillStyle = withAlpha(color, 0.6);
    for (const o of stats.outliers) {
      ctx.beginPath();
      ctx.arc(cx, yPix(o), 1.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

export function drawBox(surface: Surface, model: CartesianModel): void {
  const layout = computeBoxes(model);
  if (!layout) return;
  const ctx = surface.marks.ctx;
  const { plot } = model;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plot.x, plot.y - 2, plot.width, plot.height + 4);
  ctx.clip();
  for (const geom of layout.geoms) drawOneBox(ctx, model, geom, layout.showOutliers);
  ctx.restore();
}

/** Box-plot interaction (the runtime uses this instead of the generic cartesian one). */
export function buildBoxInteraction(model: CartesianModel): InteractionModel | void {
  const spec = model.spec as BoxSpec;
  const tt = spec.tooltip;
  if (tt === false || (tt && typeof tt === 'object' && tt.show === false)) return;
  const layout = computeBoxes(model);
  if (!layout) return;
  const { geoms, showOutliers } = layout;
  const fmt = (v: number): string => formatValue(v, spec.encoding.y.format);

  return {
    region: model.plot,
    hitTest: (px, py) => {
      const hit = geoms.find(
        (g) => px >= g.left - 4 && px <= g.right + 4 && py >= g.top - 6 && py <= g.bottom + 6,
      );
      if (!hit) return null;
      const s = hit.stats;
      const rows: TooltipRow[] = [
        { label: 'Max', value: fmt(s.max) },
        { swatch: hit.color, label: 'Q3', value: fmt(s.q3) },
        { label: 'Median', value: fmt(s.median) },
        { swatch: hit.color, label: 'Q1', value: fmt(s.q1) },
        { label: 'Min', value: fmt(s.min) },
        { label: 'n', value: String(s.count), muted: true },
      ];
      if (showOutliers && s.outliers.length) {
        rows.push({ label: 'Outliers', value: String(s.outliers.length), muted: true });
      }
      return {
        key: hit.key,
        anchorX: hit.cx,
        anchorY: hit.top,
        content: { title: hit.title, rows },
        draw: (ictx) => {
          const top = Math.min(model.y.pixel(hit.stats.q1), model.y.pixel(hit.stats.q3));
          const h = Math.max(1, Math.abs(model.y.pixel(hit.stats.q1) - model.y.pixel(hit.stats.q3)));
          ictx.save();
          ictx.strokeStyle = hit.color;
          ictx.lineWidth = 2;
          ictx.beginPath();
          roundedRect(ictx, hit.left, top, hit.boxW, h, Math.min(3, hit.boxW / 4));
          ictx.stroke();
          ictx.restore();
        },
      };
    },
  };
}
