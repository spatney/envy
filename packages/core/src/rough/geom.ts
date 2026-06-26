/**
 * Geometry helpers for the rough engine: polygon hachure (parallel fill lines)
 * and the rotation math it needs. Kept pure and allocation-light so fills stay
 * cheap even on dense charts (heatmaps, stacked bars).
 */

import type { Point } from '../types';

/** Rotate `p` by `angle` radians around `center`. */
export function rotatePoint(p: Point, center: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function bboxCenter(points: readonly Point[]): Point {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** A filled hachure stroke: a single straight segment from a to b. */
export type HachureSegment = [Point, Point];

/**
 * Generate parallel scan-line segments that fill `polygon`, angled at
 * `angleDeg`. The classic rough.js fill: rotate the polygon flat, sweep
 * horizontal scan lines spaced `gap` apart, intersect each with the edges, pair
 * the crossings, then rotate the resulting segments back.
 *
 * `maxLines` caps density so a huge/under-spaced shape can't explode the segment
 * count (it widens the step instead) — important for performance on dense charts.
 */
export function polygonHachureLines(
  polygon: readonly Point[],
  gap: number,
  angleDeg: number,
  maxLines = 2400,
): HachureSegment[] {
  if (polygon.length < 3) return [];

  const angle = (angleDeg * Math.PI) / 180;
  const center = bboxCenter(polygon);
  const rotated = polygon.map((p) => rotatePoint(p, center, -angle));

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of rotated) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const span = maxY - minY;
  if (span <= 0) return [];

  let step = Math.max(0.5, gap);
  if (span / step > maxLines) step = span / maxLines;

  const segments: HachureSegment[] = [];
  const xs: number[] = [];
  const n = rotated.length;

  for (let y = minY + step / 2; y < maxY; y += step) {
    xs.length = 0;
    for (let i = 0; i < n; i++) {
      const a = rotated[i];
      const b = rotated[(i + 1) % n];
      const y0 = a.y;
      const y1 = b.y;
      if (y0 === y1) continue;
      if ((y >= y0 && y < y1) || (y >= y1 && y < y0)) {
        const t = (y - y0) / (y1 - y0);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((m, k) => m - k);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const p0 = rotatePoint({ x: xs[i], y }, center, angle);
      const p1 = rotatePoint({ x: xs[i + 1], y }, center, angle);
      segments.push([p0, p1]);
    }
  }
  return segments;
}

/**
 * Sample a circular arc into a polyline. Angles use the same convention as
 * `shape/arc`: 0 at 12 o'clock, positive clockwise. Inclusive of both ends.
 */
export function sampleArc(
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number,
): Point[] {
  const out: Point[] = [];
  const count = Math.max(1, segments);
  for (let i = 0; i <= count; i++) {
    const a = startAngle + ((endAngle - startAngle) * i) / count;
    out.push({
      x: cx + radius * Math.cos(a - Math.PI / 2),
      y: cy + radius * Math.sin(a - Math.PI / 2),
    });
  }
  return out;
}
