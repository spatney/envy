import type { PathSink } from './sink';

export function roundedRect(
  sink: PathSink,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number | [number, number, number, number],
): void {
  let left = x;
  let top = y;
  let width = w;
  let height = h;

  if (width < 0) {
    left += width;
    width = -width;
  }

  if (height < 0) {
    top += height;
    height = -height;
  }

  const radiusValues = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
  const maxRadius = Math.min(width, height) / 2;
  const [topLeft, topRight, bottomRight, bottomLeft] = radiusValues.map((radius) =>
    Math.min(Math.max(0, radius), maxRadius),
  ) as [number, number, number, number];

  const right = left + width;
  const bottom = top + height;

  if (topLeft === 0 && topRight === 0 && bottomRight === 0 && bottomLeft === 0) {
    sink.moveTo(left, top);
    sink.lineTo(right, top);
    sink.lineTo(right, bottom);
    sink.lineTo(left, bottom);
    sink.lineTo(left, top);
    sink.closePath();
    return;
  }

  sink.moveTo(left + topLeft, top);
  sink.lineTo(right - topRight, top);
  if (topRight > 0) {
    sink.quadraticCurveTo(right, top, right, top + topRight);
  }

  sink.lineTo(right, bottom - bottomRight);
  if (bottomRight > 0) {
    sink.quadraticCurveTo(right, bottom, right - bottomRight, bottom);
  }

  sink.lineTo(left + bottomLeft, bottom);
  if (bottomLeft > 0) {
    sink.quadraticCurveTo(left, bottom, left, bottom - bottomLeft);
  }

  sink.lineTo(left, top + topLeft);
  if (topLeft > 0) {
    sink.quadraticCurveTo(left, top, left + topLeft, top);
  }

  sink.closePath();
}
