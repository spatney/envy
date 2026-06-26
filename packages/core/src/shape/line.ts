import type { Point } from '../types';
import { curveLinear, type Curve } from './curves';
import type { PathSink } from './sink';

export interface LineOptions {
  curve?: Curve;
}

const isDefinedPoint = (point: Point): boolean => !Number.isNaN(point.x) && !Number.isNaN(point.y);

export function line(opts: LineOptions = {}): (points: Point[], sink: PathSink) => void {
  const curve = opts.curve ?? curveLinear;

  return (points, sink): void => {
    let segment: Point[] = [];

    const flush = (): void => {
      if (segment.length > 0) {
        curve(segment, sink);
        segment = [];
      }
    };

    for (const point of points) {
      if (isDefinedPoint(point)) {
        segment.push(point);
      } else {
        flush();
      }
    }

    flush();
  };
}
