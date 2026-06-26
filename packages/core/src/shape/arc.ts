import type { PathSink } from './sink';

export interface ArcOptions {
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  endAngle: number;
  cornerRadius?: number;
  padAngle?: number;
}

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const EPSILON = 1e-12;

const polarX = (cx: number, radius: number, angle: number): number => cx + radius * Math.cos(angle - HALF_PI);
const polarY = (cy: number, radius: number, angle: number): number => cy + radius * Math.sin(angle - HALF_PI);

/**
 * Creates a pie/donut path generator.
 *
 * Angles are radians with 0 at 12 o'clock and positive angles moving clockwise.
 * `padAngle` symmetrically trims the angular span. `cornerRadius` is accepted for
 * API compatibility and clamped, but corners remain circular arc/radial joins.
 */
export function arc(opts: ArcOptions): (sink: PathSink, cx: number, cy: number) => void {
  const pad = Math.max(0, opts.padAngle ?? 0) / 2;
  const rawDelta = opts.endAngle - opts.startAngle;
  const direction = rawDelta < 0 ? -1 : 1;
  const startAngle = opts.startAngle + direction * pad;
  const endAngle = opts.endAngle - direction * pad;
  const delta = endAngle - startAngle;
  const outerRadius = Math.max(0, opts.outerRadius);
  const innerRadius = Math.min(Math.max(0, opts.innerRadius), outerRadius);
  const _cornerRadius = Math.min(Math.max(0, opts.cornerRadius ?? 0), (outerRadius - innerRadius) / 2);

  return (sink, cx, cy): void => {
    if (outerRadius <= 0 || Math.abs(delta) <= EPSILON) {
      sink.moveTo(cx, cy);
      sink.closePath();
      return;
    }

    const clockwise = delta >= 0;
    const canvasStart = startAngle - HALF_PI;
    const canvasEnd = endAngle - HALF_PI;
    const isFullCircle = Math.abs(rawDelta) >= TAU - EPSILON;

    sink.moveTo(polarX(cx, outerRadius, startAngle), polarY(cy, outerRadius, startAngle));
    sink.arc(cx, cy, outerRadius, canvasStart, isFullCircle ? canvasStart + direction * TAU : canvasEnd, !clockwise);

    if (innerRadius > 0) {
      if (isFullCircle) {
        sink.moveTo(polarX(cx, innerRadius, endAngle), polarY(cy, innerRadius, endAngle));
      } else {
        sink.lineTo(polarX(cx, innerRadius, endAngle), polarY(cy, innerRadius, endAngle));
      }
      sink.arc(
        cx,
        cy,
        innerRadius,
        isFullCircle ? canvasStart + direction * TAU : canvasEnd,
        canvasStart,
        clockwise,
      );
    } else if (!isFullCircle) {
      sink.lineTo(cx, cy);
    }

    sink.closePath();
  };
}
