import type { Point } from '../types';
import { curveLinear, type Curve } from './curves';
import type { PathSink } from './sink';

export interface AreaPoint {
  x: number;
  y0: number;
  y1: number;
}

export interface AreaOptions {
  curve?: Curve;
}

const isDefinedAreaPoint = (point: AreaPoint): boolean =>
  !Number.isNaN(point.x) && !Number.isNaN(point.y0) && !Number.isNaN(point.y1);

function continuingSink(sink: PathSink): PathSink {
  let firstMove = true;

  return {
    moveTo(x, y): void {
      if (firstMove) {
        firstMove = false;
        sink.lineTo(x, y);
      } else {
        sink.moveTo(x, y);
      }
    },
    lineTo: sink.lineTo.bind(sink),
    bezierCurveTo: sink.bezierCurveTo.bind(sink),
    quadraticCurveTo: sink.quadraticCurveTo.bind(sink),
    arc: sink.arc.bind(sink),
    closePath: sink.closePath.bind(sink),
  };
}

export function area(opts: AreaOptions = {}): (points: AreaPoint[], sink: PathSink) => void {
  const curve = opts.curve ?? curveLinear;

  return (points, sink): void => {
    let segment: AreaPoint[] = [];

    const flush = (): void => {
      if (segment.length === 0) {
        return;
      }

      const top: Point[] = segment.map((point) => ({ x: point.x, y: point.y1 }));
      const bottom: Point[] = [...segment]
        .reverse()
        .map((point) => ({ x: point.x, y: point.y0 }));

      curve(top, sink);
      curve(bottom, continuingSink(sink));
      sink.closePath();
      segment = [];
    };

    for (const point of points) {
      if (isDefinedAreaPoint(point)) {
        segment.push(point);
      } else {
        flush();
      }
    }

    flush();
  };
}
