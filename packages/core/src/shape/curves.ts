import type { Point } from '../types';
import type { PathSink } from './sink';

export type Curve = (points: Point[], sink: PathSink) => void;

const sign = (value: number): number => (value < 0 ? -1 : value > 0 ? 1 : 0);

export function curveLinear(points: Point[], sink: PathSink): void {
  if (points.length === 0) {
    return;
  }

  sink.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    sink.lineTo(points[i].x, points[i].y);
  }
}

export function curveStepAfter(points: Point[], sink: PathSink): void {
  if (points.length === 0) {
    return;
  }

  sink.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    sink.lineTo(current.x, previous.y);
    sink.lineTo(current.x, current.y);
  }
}

export function curveStepBefore(points: Point[], sink: PathSink): void {
  if (points.length === 0) {
    return;
  }

  sink.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    sink.lineTo(previous.x, current.y);
    sink.lineTo(current.x, current.y);
  }
}

export const curveStep: Curve = curveStepAfter;

export function monotoneXTangents(points: Point[]): number[] {
  const n = points.length;
  if (n < 2) {
    return n === 1 ? [0] : [];
  }

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = points[i + 1].x - points[i].x;
    slopes.push(dx === 0 ? 0 : (points[i + 1].y - points[i].y) / dx);
  }

  const tangents = new Array<number>(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  for (let i = 1; i < n - 1; i += 1) {
    const previousSlope = slopes[i - 1];
    const nextSlope = slopes[i];

    if (previousSlope === 0 || nextSlope === 0 || sign(previousSlope) !== sign(nextSlope)) {
      tangents[i] = 0;
      continue;
    }

    const previousWidth = points[i].x - points[i - 1].x;
    const nextWidth = points[i + 1].x - points[i].x;
    const weightedSlope = (previousSlope * nextWidth + nextSlope * previousWidth) / (previousWidth + nextWidth);
    tangents[i] = (sign(previousSlope) + sign(nextSlope)) * Math.min(
      Math.abs(previousSlope),
      Math.abs(nextSlope),
      Math.abs(weightedSlope) / 2,
    );
  }

  return tangents;
}

export function curveMonotoneX(points: Point[], sink: PathSink): void {
  if (points.length === 0) {
    return;
  }

  sink.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    return;
  }

  const tangents = monotoneXTangents(points);
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    const dx = end.x - start.x;

    if (dx === 0) {
      sink.lineTo(end.x, end.y);
      continue;
    }

    sink.bezierCurveTo(
      start.x + dx / 3,
      start.y + (tangents[i] * dx) / 3,
      end.x - dx / 3,
      end.y - (tangents[i + 1] * dx) / 3,
      end.x,
      end.y,
    );
  }
}

export function curveCatmullRom(points: Point[], sink: PathSink): void {
  if (points.length === 0) {
    return;
  }

  sink.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    sink.bezierCurveTo(
      p1.x + (p2.x - p0.x) / 6,
      p1.y + (p2.y - p0.y) / 6,
      p2.x - (p3.x - p1.x) / 6,
      p2.y - (p3.y - p1.y) / 6,
      p2.x,
      p2.y,
    );
  }
}
