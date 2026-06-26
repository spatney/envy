import { describe, expect, it } from 'vitest';
import type { PathSink } from './sink';
import {
  arc,
  area,
  curveLinear,
  curveMonotoneX,
  curveStepAfter,
  curveStepBefore,
  line,
  roundedRect,
} from './index';

type Command =
  | ['moveTo', number, number]
  | ['lineTo', number, number]
  | ['bezierCurveTo', number, number, number, number, number, number]
  | ['quadraticCurveTo', number, number, number, number]
  | ['arc', number, number, number, number, number, boolean | undefined]
  | ['closePath'];

class MockPathSink implements PathSink {
  readonly commands: Command[] = [];

  moveTo(x: number, y: number): void {
    this.commands.push(['moveTo', x, y]);
  }

  lineTo(x: number, y: number): void {
    this.commands.push(['lineTo', x, y]);
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    this.commands.push(['bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y]);
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    this.commands.push(['quadraticCurveTo', cpx, cpy, x, y]);
  }

  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number,
    counterclockwise?: boolean,
  ): void {
    this.commands.push(['arc', x, y, radius, startAngle, endAngle, counterclockwise]);
  }

  closePath(): void {
    this.commands.push(['closePath']);
  }
}

const sink = (): MockPathSink => new MockPathSink();

describe('PathSink', () => {
  it('is structurally compatible with CanvasRenderingContext2D path methods', () => {
    const canvasSink: PathSink = {} as CanvasRenderingContext2D;
    expect(canvasSink).toBeDefined();
  });
});

describe('curves', () => {
  it('curveLinear draws through three points', () => {
    const mock = sink();

    curveLinear(
      [
        { x: 0, y: 1 },
        { x: 2, y: 3 },
        { x: 4, y: 5 },
      ],
      mock,
    );

    expect(mock.commands).toEqual([
      ['moveTo', 0, 1],
      ['lineTo', 2, 3],
      ['lineTo', 4, 5],
    ]);
  });

  it('curveStepAfter creates a staircase after each x', () => {
    const mock = sink();

    curveStepAfter(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 10 },
      ],
      mock,
    );

    expect(mock.commands).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 10, 0],
      ['lineTo', 10, 5],
      ['lineTo', 20, 5],
      ['lineTo', 20, 10],
    ]);
  });

  it('curveStepBefore creates a staircase before each x', () => {
    const mock = sink();

    curveStepBefore(
      [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 10 },
      ],
      mock,
    );

    expect(mock.commands).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 0, 5],
      ['lineTo', 10, 5],
      ['lineTo', 10, 10],
      ['lineTo', 20, 10],
    ]);
  });

  it('curveMonotoneX emits bounded cubic control points and exact anchors', () => {
    const mock = sink();
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 2 },
      { x: 2, y: 3 },
      { x: 3, y: 5 },
    ];

    curveMonotoneX(points, mock);

    expect(mock.commands[0]).toEqual(['moveTo', 0, 0]);
    const beziers = mock.commands.filter((command): command is Extract<Command, ['bezierCurveTo', number, number, number, number, number, number]> => command[0] === 'bezierCurveTo');
    expect(beziers).toHaveLength(3);
    expect(beziers[2].slice(5)).toEqual([3, 5]);

    for (let i = 0; i < beziers.length; i += 1) {
      const [, , cp1y, , cp2y, x, y] = beziers[i];
      const minY = Math.min(points[i].y, points[i + 1].y);
      const maxY = Math.max(points[i].y, points[i + 1].y);
      expect(cp1y).toBeGreaterThanOrEqual(minY);
      expect(cp1y).toBeLessThanOrEqual(maxY);
      expect(cp2y).toBeGreaterThanOrEqual(minY);
      expect(cp2y).toBeLessThanOrEqual(maxY);
      expect([x, y]).toEqual([points[i + 1].x, points[i + 1].y]);
    }
  });
});

describe('line', () => {
  it('restarts sub-paths after NaN gaps', () => {
    const mock = sink();

    line()(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: Number.NaN, y: 2 },
        { x: 3, y: 3 },
      ],
      mock,
    );

    expect(mock.commands.filter((command) => command[0] === 'moveTo')).toEqual([
      ['moveTo', 0, 0],
      ['moveTo', 3, 3],
    ]);
  });
});

describe('area', () => {
  it('draws top forward, bottom backward, then closes', () => {
    const mock = sink();

    area()(
      [
        { x: 0, y0: 10, y1: 20 },
        { x: 1, y0: 11, y1: 22 },
        { x: 2, y0: 12, y1: 24 },
      ],
      mock,
    );

    expect(mock.commands).toEqual([
      ['moveTo', 0, 20],
      ['lineTo', 1, 22],
      ['lineTo', 2, 24],
      ['lineTo', 2, 12],
      ['lineTo', 1, 11],
      ['lineTo', 0, 10],
      ['closePath'],
    ]);
  });
});

describe('arc', () => {
  it('draws a quarter wedge with the expected center and radius', () => {
    const mock = sink();

    arc({ innerRadius: 0, outerRadius: 10, startAngle: 0, endAngle: Math.PI / 2 })(mock, 100, 50);

    const arcCommand = mock.commands.find((command) => command[0] === 'arc');
    expect(arcCommand).toEqual(['arc', 100, 50, 10, -Math.PI / 2, 0, false]);
    expect(mock.commands.at(-1)).toEqual(['closePath']);
  });

  it('handles full-circle wedges', () => {
    const mock = sink();

    arc({ innerRadius: 0, outerRadius: 8, startAngle: 0, endAngle: Math.PI * 2 })(mock, 0, 0);

    const arcs = mock.commands.filter((command) => command[0] === 'arc');
    expect(arcs).toHaveLength(1);
    expect(arcs[0][3]).toBe(8);
    expect(mock.commands).not.toContainEqual(['lineTo', 0, 0]);
  });

  it('emits outer and inner arcs for donuts', () => {
    const mock = sink();

    arc({ innerRadius: 4, outerRadius: 8, startAngle: 0, endAngle: Math.PI })(mock, 5, 6);

    const arcs = mock.commands.filter((command) => command[0] === 'arc');
    expect(arcs).toHaveLength(2);
    expect(arcs.map((command) => command[3])).toEqual([8, 4]);
    expect(arcs.every((command) => command[1] === 5 && command[2] === 6)).toBe(true);
  });
});

describe('roundedRect', () => {
  it('draws a plain rectangle when radius is zero', () => {
    const mock = sink();

    roundedRect(mock, 0, 0, 10, 20, 0);

    expect(mock.commands).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 10, 0],
      ['lineTo', 10, 20],
      ['lineTo', 0, 20],
      ['lineTo', 0, 0],
      ['closePath'],
    ]);
  });

  it('uses curved corner commands when radius is positive', () => {
    const mock = sink();

    roundedRect(mock, 0, 0, 10, 10, 2);

    expect(mock.commands.some((command) => command[0] === 'quadraticCurveTo' || command[0] === 'arc')).toBe(true);
    expect(mock.commands.at(-1)).toEqual(['closePath']);
  });

  it('normalizes negative height to a valid rectangle', () => {
    const mock = sink();

    roundedRect(mock, 0, 10, 10, -10, 0);

    expect(mock.commands).toEqual([
      ['moveTo', 0, 0],
      ['lineTo', 10, 0],
      ['lineTo', 10, 10],
      ['lineTo', 0, 10],
      ['lineTo', 0, 0],
      ['closePath'],
    ]);
  });
});
