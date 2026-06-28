import { describe, expect, it } from 'vitest';
import type { Point } from '../types';
import { createRoughPen, RoughPen, type RoughContext } from './draw';
import { mulberry32, hashString } from './rng';
import { polygonHachureLines, sampleArc } from './geom';

type Op =
  | ['moveTo', number, number]
  | ['lineTo', number, number]
  | ['bezierCurveTo', number, number, number, number, number, number]
  | ['quadraticCurveTo', number, number, number, number]
  | ['stroke', string, number, number]
  | ['fill', string, number]
  | ['beginPath']
  | ['closePath'];

/** Records every drawing call so two renders can be compared for determinism. */
class RecordingContext implements RoughContext {
  readonly ops: Op[] = [];
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  lineJoin: CanvasLineJoin = 'miter';
  strokeStyle: string | CanvasGradient | CanvasPattern = '#000';
  fillStyle: string | CanvasGradient | CanvasPattern = '#000';
  globalAlpha = 1;

  save(): void {}
  restore(): void {}
  beginPath(): void {
    this.ops.push(['beginPath']);
  }
  closePath(): void {
    this.ops.push(['closePath']);
  }
  moveTo(x: number, y: number): void {
    this.ops.push(['moveTo', round(x), round(y)]);
  }
  lineTo(x: number, y: number): void {
    this.ops.push(['lineTo', round(x), round(y)]);
  }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.ops.push(['bezierCurveTo', round(a), round(b), round(c), round(d), round(e), round(f)]);
  }
  quadraticCurveTo(a: number, b: number, c: number, d: number): void {
    this.ops.push(['quadraticCurveTo', round(a), round(b), round(c), round(d)]);
  }
  stroke(): void {
    this.ops.push(['stroke', String(this.strokeStyle), round(this.lineWidth), round(this.globalAlpha)]);
  }
  fill(): void {
    this.ops.push(['fill', String(this.fillStyle), round(this.globalAlpha)]);
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

const SQUARE: Point[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different streams for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toEqual(b());
  });

  it('stays within [0, 1)', () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('hashString', () => {
  it('is stable and unsigned', () => {
    expect(hashString('line:Revenue:52')).toBe(hashString('line:Revenue:52'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('anything')).toBeGreaterThanOrEqual(0);
  });
});

describe('RoughPen determinism', () => {
  it('createRoughPen returns a RoughPen instance', () => {
    expect(createRoughPen(new RecordingContext(), { seed: 1 })).toBeInstanceOf(RoughPen);
  });

  it('renders identical ops for the same seed', () => {
    const draw = (): Op[] => {
      const ctx = new RecordingContext();
      const pen = new RoughPen(ctx, { seed: 99 });
      pen.rect(10, 10, 80, 60, { stroke: '#111', fill: '#3b82f6' });
      pen.polyline(
        [
          { x: 0, y: 0 },
          { x: 50, y: 30 },
          { x: 100, y: 10 },
        ],
        { stroke: '#f00' },
      );
      pen.circle(40, 40, 6, { stroke: '#0a0', fill: '#0a0' });
      pen.wedge(50, 50, 0, 40, 0, Math.PI / 2, { stroke: '#000', fill: '#fa0' });
      return ctx.ops;
    };
    expect(draw()).toEqual(draw());
  });

  it('renders different ops for different seeds', () => {
    const ctxA = new RecordingContext();
    const ctxB = new RecordingContext();
    new RoughPen(ctxA, { seed: 1 }).rect(0, 0, 100, 100, { stroke: '#000', fill: '#000' });
    new RoughPen(ctxB, { seed: 2 }).rect(0, 0, 100, 100, { stroke: '#000', fill: '#000' });
    expect(ctxA.ops).not.toEqual(ctxB.ops);
  });

  it('still differs mark-to-mark within one chart (shared PRNG advances)', () => {
    const ctx = new RecordingContext();
    const pen = new RoughPen(ctx, { seed: 5 });
    pen.rect(0, 0, 50, 50, { stroke: '#000' });
    const firstRect = ctx.ops.slice();
    ctx.ops.length = 0;
    pen.rect(0, 0, 50, 50, { stroke: '#000' });
    expect(ctx.ops).not.toEqual(firstRect);
  });
});

describe('RoughPen output shape', () => {
  it('emits a fill then a stroke for a filled solid polygon', () => {
    const ctx = new RecordingContext();
    new RoughPen(ctx, { seed: 3, fillStyle: 'solid' }).polygon(SQUARE, {
      stroke: '#111',
      fill: '#222',
    });
    const kinds = ctx.ops.map((o) => o[0]);
    expect(kinds).toContain('fill');
    expect(kinds).toContain('stroke');
    expect(kinds.indexOf('fill')).toBeLessThan(kinds.lastIndexOf('stroke'));
  });

  it('hachure fill emits many short stroked segments', () => {
    const ctx = new RecordingContext();
    new RoughPen(ctx, { seed: 3, fillStyle: 'hachure', hachureGap: 6 }).polygon(SQUARE, {
      fill: '#222',
    });
    const beziers = ctx.ops.filter((o) => o[0] === 'bezierCurveTo');
    // ~100px tall / 6px gap ⇒ well over a dozen hachure lines.
    expect(beziers.length).toBeGreaterThan(10);
  });

  it('cross-hatch emits more fill strokes than hachure', () => {
    const hachure = new RecordingContext();
    const cross = new RecordingContext();
    new RoughPen(hachure, { seed: 3, fillStyle: 'hachure', hachureGap: 8 }).polygon(SQUARE, { fill: '#222' });
    new RoughPen(cross, { seed: 3, fillStyle: 'cross-hatch', hachureGap: 8 }).polygon(SQUARE, { fill: '#222' });
    expect(cross.ops.filter((o) => o[0] === 'bezierCurveTo').length).toBeGreaterThan(
      hachure.ops.filter((o) => o[0] === 'bezierCurveTo').length,
    );
  });

  it('trendStroke amplifies wobble compared to a normal polyline with matching output shape', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 2 },
      { x: 20, y: 1 },
    ];
    const normal = new RecordingContext();
    const trend = new RecordingContext();
    new RoughPen(normal, { seed: 4, roughness: 1, bowing: 1 }).polyline(points, { stroke: '#000' });
    new RoughPen(trend, { seed: 4, roughness: 1, bowing: 1 }).trendStroke(points, { stroke: '#000' });
    expect(trend.ops.map((o) => o[0])).toEqual(normal.ops.map((o) => o[0]));
    expect(trend.ops).not.toEqual(normal.ops);
  });

  it('roughness changes the wobble without changing the call sequence', () => {
    const smooth = new RecordingContext();
    const rough = new RecordingContext();
    new RoughPen(smooth, { seed: 11, roughness: 0 }).rect(0, 0, 40, 20, { stroke: '#000' });
    new RoughPen(rough, { seed: 11, roughness: 2 }).rect(0, 0, 40, 20, { stroke: '#000' });
    expect(rough.ops.map((o) => o[0])).toEqual(smooth.ops.map((o) => o[0]));
    expect(rough.ops).not.toEqual(smooth.ops);
  });

  it('skips degenerate marks', () => {
    const ctx = new RecordingContext();
    const pen = new RoughPen(ctx, { seed: 1 });
    pen.rect(10, 10, 0, 50, { fill: '#000' });
    pen.circle(10, 10, 0, { fill: '#000' });
    pen.polyline([{ x: 0, y: 0 }], { stroke: '#000' });
    expect(ctx.ops).toEqual([]);
  });
});

describe('polygonHachureLines', () => {
  it('fills a square with parallel segments inside its bounds', () => {
    const segs = polygonHachureLines(SQUARE, 8, 0);
    expect(segs.length).toBeGreaterThan(5);
    for (const [a, b] of segs) {
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(-1);
        expect(p.x).toBeLessThanOrEqual(101);
        expect(p.y).toBeGreaterThanOrEqual(-1);
        expect(p.y).toBeLessThanOrEqual(101);
      }
    }
  });

  it('caps line count for tiny gaps (no explosion)', () => {
    const segs = polygonHachureLines(SQUARE, 0.001, 0, 200);
    expect(segs.length).toBeLessThanOrEqual(200);
  });

  it('returns nothing for degenerate polygons', () => {
    expect(polygonHachureLines([{ x: 0, y: 0 }], 4, 0)).toEqual([]);
  });
});

describe('sampleArc', () => {
  it('returns segments+1 points spanning the arc', () => {
    const pts = sampleArc(0, 0, 10, 0, Math.PI / 2, 6);
    expect(pts).toHaveLength(7);
    // start is at 12 o'clock (0, -10), end at 3 o'clock (10, 0).
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(-10);
    expect(pts[6].x).toBeCloseTo(10);
    expect(pts[6].y).toBeCloseTo(0);
  });
});
