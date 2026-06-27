/**
 * The rough (hand-drawn) drawing engine.
 *
 * A `RoughPen` wraps a Canvas2D-like context and a single seeded PRNG, exposing
 * the handful of primitives charts need — polylines, polygons, rects, circles,
 * and pie wedges — rendered as wobbly multi-pass strokes with hachure / solid /
 * cross-hatch fills. The shared PRNG means marks differ from one another yet the
 * whole chart is deterministic given its seed (call order is stable).
 *
 * The line model is a faithful port of rough.js's: each segment is a cubic with
 * two randomly displaced control points, drawn twice for the sketched, doubled
 * look; `bowing` bends the midpoint, `roughness` scales the jitter.
 */

import type { Point } from '../types';
import { mulberry32, type Rng } from './rng';
import { polygonHachureLines, sampleArc } from './geom';
import { DEFAULT_ROUGH_STYLE, type MarkOptions, type RoughStyle } from './types';

/** The minimal Canvas2D surface the engine draws onto (CRC2D satisfies it). */
export interface RoughContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  bezierCurveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number,
  ): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  stroke(): void;
  fill(): void;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
}

const MAX_OFFSET = 2;
const TAU = Math.PI * 2;

// Trend-stroke wobble multipliers (see `RoughPen.trendStroke`). Trend lines are
// many short segments where the default wobble is barely perceptible; these were
// tuned so line/area/sparkline strokes read as clearly hand-drawn while still
// tracking their data points closely.
const TREND_ROUGHNESS = 1.8;
const TREND_BOWING = 5;

function isFinitePoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

interface ResolvedMark extends RoughStyle {
  stroke?: string;
  fill?: string;
  fillWeight?: number;
  fillAlpha?: number;
  strokeAlpha?: number;
}

export class RoughPen {
  private readonly ctx: RoughContext;
  private readonly base: RoughStyle;
  private readonly rng: Rng;

  constructor(ctx: RoughContext, style: Partial<RoughStyle> = {}) {
    this.ctx = ctx;
    this.base = { ...DEFAULT_ROUGH_STYLE, ...style };
    this.rng = mulberry32(this.base.seed >>> 0);
  }

  private resolve(opts: MarkOptions): ResolvedMark {
    return { ...this.base, ...opts };
  }

  /** A symmetric random offset in [-x, x], scaled by a length-based gain. */
  private off(x: number, gain: number): number {
    return gain * (this.rng() * 2 * x - x);
  }

  /**
   * Append one hand-drawn cubic from (x1,y1) to (x2,y2) to the current path.
   * `overlay` is the second, tighter pass that creates the doubled-stroke look.
   */
  private emitLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    m: ResolvedMark,
    move: boolean,
    overlay: boolean,
  ): void {
    const ctx = this.ctx;
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 0.0001) {
      if (move) ctx.moveTo(x1, y1);
      return;
    }

    let gain = 1;
    if (len > 500) gain = 0.4;
    else if (len > 200) gain = -0.0016668 * len + 1.233334;

    let offset = MAX_OFFSET;
    if (offset * 10 > len) offset = len / 10;
    offset *= m.roughness;

    const half = overlay ? offset / 2 : offset;
    const diverge = 0.2 + this.rng() * 0.2;

    let midX = (m.bowing * MAX_OFFSET * (y2 - y1)) / 200;
    let midY = (m.bowing * MAX_OFFSET * (x1 - x2)) / 200;
    midX = this.off(midX, gain);
    midY = this.off(midY, gain);

    if (move) ctx.moveTo(x1 + this.off(offset, gain), y1 + this.off(offset, gain));
    ctx.bezierCurveTo(
      midX + x1 + (x2 - x1) * diverge + this.off(half, gain),
      midY + y1 + (y2 - y1) * diverge + this.off(half, gain),
      midX + x1 + 2 * (x2 - x1) * diverge + this.off(half, gain),
      midY + y1 + 2 * (y2 - y1) * diverge + this.off(half, gain),
      x2 + this.off(half, gain),
      y2 + this.off(half, gain),
    );
  }

  /** Build a doubled hand-drawn stroke through `points` into the current path. */
  private tracePolyline(points: readonly Point[], m: ResolvedMark, close: boolean): void {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i + 1 < points.length; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!isFinitePoint(a) || !isFinitePoint(b)) continue;
        const startsNew = i === 0 || !isFinitePoint(points[i - 1]);
        this.emitLine(a.x, a.y, b.x, b.y, m, startsNew, pass === 1);
      }
      if (close && points.length > 2) {
        const a = points[points.length - 1];
        const b = points[0];
        if (isFinitePoint(a) && isFinitePoint(b)) {
          this.emitLine(a.x, a.y, b.x, b.y, m, true, pass === 1);
        }
      }
    }
  }

  /**
   * Trace a smooth *closed* loop through `points` (quadratic spline through the
   * segment midpoints, with each point as a control). Used for circles so they
   * read as round hand-drawn blobs rather than angular polygons.
   */
  private traceSmoothClosed(points: readonly Point[]): void {
    const ctx = this.ctx;
    const n = points.length;
    if (n < 3) {
      points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      return;
    }
    const last = points[n - 1];
    const first = points[0];
    ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
    for (let i = 0; i < n; i++) {
      const curr = points[i];
      const next = points[(i + 1) % n];
      ctx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) / 2, (curr.y + next.y) / 2);
    }
    ctx.closePath();
  }

  private applyStroke(m: ResolvedMark, weight = m.strokeWidth): void {
    const ctx = this.ctx;
    ctx.lineWidth = weight;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = m.stroke ?? '#000';
    ctx.globalAlpha = m.strokeAlpha ?? 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Fill a closed polygon with hachure / cross-hatch / solid. */
  private fillPolygon(points: readonly Point[], m: ResolvedMark): void {
    if (!m.fill) return;
    const ctx = this.ctx;

    if (m.fillStyle === 'solid') {
      ctx.beginPath();
      this.tracePolyline(points, { ...m, roughness: m.roughness * 0.6 }, true);
      ctx.closePath();
      ctx.fillStyle = m.fill;
      ctx.globalAlpha = m.fillAlpha ?? 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    const gap = m.hachureGap > 0 ? m.hachureGap : Math.max(3, m.strokeWidth * 3.2);
    const angles =
      m.fillStyle === 'cross-hatch' ? [m.hachureAngle, m.hachureAngle + 90] : [m.hachureAngle];
    const weight = m.fillWeight ?? Math.max(0.7, m.strokeWidth * 0.55);

    ctx.beginPath();
    for (const angle of angles) {
      const segments = polygonHachureLines(points, gap, angle);
      for (const [p0, p1] of segments) {
        this.emitLine(p0.x, p0.y, p1.x, p1.y, m, true, false);
      }
    }
    ctx.lineWidth = weight;
    ctx.lineCap = 'round';
    ctx.strokeStyle = m.fill;
    ctx.globalAlpha = m.fillAlpha ?? 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Hand-drawn open polyline (axis rules, box-plot whiskers, short features). */
  polyline(points: readonly Point[], opts: MarkOptions = {}): void {
    const m = this.resolve(opts);
    if (points.length < 2) return;
    this.ctx.beginPath();
    this.tracePolyline(points, m, false);
    this.applyStroke(m);
  }

  /**
   * Hand-drawn open stroke for data *trend* lines — line/area tops and KPI
   * sparklines. A trend line is many short segments, and both the bowing
   * (length-scaled) and the per-segment endpoint jitter stay tiny on short
   * segments, so a plain {@link polyline} reads almost ruler-straight — out of
   * keeping with the confidently wobbly bars/wedges. This amplifies the wobble
   * so trend lines read as clearly hand-drawn. Axis rules and box-plot features
   * keep the subtler {@link polyline} (a long axis rule would over-bow here).
   */
  trendStroke(points: readonly Point[], opts: MarkOptions = {}): void {
    const m = this.resolve(opts);
    if (points.length < 2) return;
    const wobbly: ResolvedMark = {
      ...m,
      roughness: m.roughness * TREND_ROUGHNESS,
      bowing: m.bowing * TREND_BOWING,
    };
    this.ctx.beginPath();
    this.tracePolyline(points, wobbly, false);
    this.applyStroke(m);
  }


  /** Hand-drawn closed polygon with optional fill (drawn behind the outline). */
  polygon(points: readonly Point[], opts: MarkOptions = {}): void {
    const m = this.resolve(opts);
    const clean = points.filter(isFinitePoint);
    if (clean.length < 2) return;
    if (m.fill) this.fillPolygon(clean, m);
    if (m.stroke) {
      this.ctx.beginPath();
      this.tracePolyline(clean, m, true);
      this.applyStroke(m);
    }
  }

  /** Hand-drawn rectangle (bars, cells, table chips). */
  rect(x: number, y: number, w: number, h: number, opts: MarkOptions = {}): void {
    if (w <= 0 || h <= 0) return;
    this.polygon(
      [
        { x, y },
        { x: x + w, y },
        { x: x + w, y: y + h },
        { x, y: y + h },
      ],
      opts,
    );
  }

  /** Hand-drawn circle (scatter points, line markers). Filled solid for clarity. */
  circle(cx: number, cy: number, r: number, opts: MarkOptions = {}): void {
    if (r <= 0) return;
    const m = this.resolve(opts);
    const ctx = this.ctx;
    // Enough segments (and a smooth spline) to read as round even for big bubbles;
    // gentle radial jitter so it wobbles like a hand-drawn circle, not a heptagon.
    const segs = Math.max(12, Math.min(40, Math.round(r * 1.2)));
    const jitter = m.roughness * Math.min(Math.max(r * 0.06, 0.3), 1.4);
    const start = this.rng() * TAU;
    const pts: Point[] = [];
    for (let i = 0; i < segs; i++) {
      const a = start + (i / segs) * TAU;
      const rr = r + (this.rng() * 2 - 1) * jitter;
      pts.push({ x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) });
    }

    if (m.fill) {
      ctx.beginPath();
      this.traceSmoothClosed(pts);
      ctx.fillStyle = m.fill;
      ctx.globalAlpha = m.fillAlpha ?? 1;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (m.stroke) {
      ctx.beginPath();
      this.traceSmoothClosed(pts);
      this.applyStroke(m);
    }
  }

  /**
   * Hand-drawn pie/donut wedge. Angles match `shape/arc`: 0 at 12 o'clock,
   * positive clockwise. `innerRadius` 0 draws a full pie slice to the center.
   */
  wedge(
    cx: number,
    cy: number,
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    endAngle: number,
    opts: MarkOptions = {},
  ): void {
    if (outerRadius <= 0 || endAngle === startAngle) return;
    const span = Math.abs(endAngle - startAngle);
    const segs = Math.max(2, Math.min(64, Math.round((span / Math.PI) * 24)));
    const outer = sampleArc(cx, cy, outerRadius, startAngle, endAngle, segs);

    let polygon: Point[];
    if (innerRadius > 0.5) {
      const inner = sampleArc(cx, cy, innerRadius, endAngle, startAngle, segs);
      polygon = [...outer, ...inner];
    } else {
      polygon = [...outer, { x: cx, y: cy }];
    }
    this.polygon(polygon, opts);
  }
}

/** Convenience factory mirroring the class constructor. */
export function createRoughPen(ctx: RoughContext, style: Partial<RoughStyle> = {}): RoughPen {
  return new RoughPen(ctx, style);
}
