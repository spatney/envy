// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { validateSpec } from '../spec/validate';
import type { CalendarHeatmapSpec, ChartSpec } from '../spec/types';
import type { Surface } from '../render/surface';
import { resolveTheme } from '../theme';
import { buildCalendarGrid, drawCalendarHeatmap } from './calendarHeatmap';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const rows = (count = 90, start = '2024-06-03') => {
  const out: { date: string; value: number }[] = [];
  const d = new Date(`${start}T00:00:00`);
  for (let i = 0; i < count; i++) {
    out.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      value: (i % 10) + 1,
    });
    d.setDate(d.getDate() + 1);
  }
  return out;
};

const calSpec = (over: Partial<CalendarHeatmapSpec> = {}): CalendarHeatmapSpec => ({
  type: 'calendarHeatmap',
  data: rows(),
  encoding: {
    date: { field: 'date', type: 'temporal' },
    color: { field: 'value', type: 'quantitative', title: 'Activity' },
  },
  title: 'Activity',
  ...over,
});

const errPaths = (spec: ChartSpec) => validateSpec(spec).errors.map((e) => e.path);

describe('validateSpec — calendarHeatmap', () => {
  it('accepts a basic calendar heatmap', () => {
    expect(validateSpec(calSpec()).errors).toEqual([]);
  });

  it('requires encoding.date', () => {
    const spec = { ...calSpec(), encoding: { color: { field: 'value' } } } as unknown as ChartSpec;
    expect(errPaths(spec)).toContain('encoding.date');
  });

  it('requires encoding.color', () => {
    const spec = { ...calSpec(), encoding: { date: { field: 'date' } } } as unknown as ChartSpec;
    expect(errPaths(spec)).toContain('encoding.color');
  });
});

describe('buildCalendarGrid', () => {
  it('builds week columns over the containing weeks and maps weekdays', () => {
    const days = new Map([
      ['2024-06-03', 1],
      ['2024-06-04', 2],
      ['2024-06-09', 3],
    ]);
    const grid = buildCalendarGrid(days);

    expect(grid.start.toDateString()).toBe(new Date(2024, 5, 2).toDateString());
    expect(grid.end.toDateString()).toBe(new Date(2024, 5, 15).toDateString());
    expect(grid.weeks).toBe(2);
    expect(grid.byIsoDate.get('2024-06-03')).toMatchObject({ week: 0, weekday: 1, present: true, value: 1 });
    expect(grid.byIsoDate.get('2024-06-09')).toMatchObject({ week: 1, weekday: 0, present: true, value: 3 });
    expect(grid.byIsoDate.get('2024-06-02')).toMatchObject({ week: 0, weekday: 0, present: false });
  });
});

function fakeContext(): { ctx: CanvasRenderingContext2D; calls: () => number } {
  let count = 0;
  const grad = { addColorStop() {} };
  const data: Record<string, unknown> = {
    canvas: { width: 600, height: 400 },
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    measureText: (t: string) => ({ width: String(t).length * 6 }),
    setLineDash() {},
  };
  const ctx = new Proxy(data, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        void args;
        count++;
        return undefined;
      };
    },
    set() {
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls: () => count };
}

describe('drawCalendarHeatmap — smoke', () => {
  it('renders labels and hit-tests a known day cell', () => {
    const { ctx, calls } = fakeContext();
    const surface = {
      marks: { ctx },
      overlay: document.createElement('div'),
      width: 600,
      height: 400,
    } as unknown as Surface;
    const spec = calSpec();
    const model = drawCalendarHeatmap(surface, spec, resolveTheme('light'), { width: 600, height: 400 });

    expect(calls()).toBeGreaterThan(0);
    expect(surface.overlay.textContent ?? '').toContain('Jun');
    expect(model).toBeTruthy();

    const grid = buildCalendarGrid(new Map(spec.data.map((d) => [d.date, d.value])));
    const target = grid.byIsoDate.get('2024-06-03');
    expect(target).toBeTruthy();
    const gap = 2;
    const cell = (model!.region.height - 6 * gap) / 7;
    const x = model!.region.x + target!.week * (cell + gap) + cell / 2;
    const y = model!.region.y + target!.weekday * (cell + gap) + cell / 2;
    const hover = model!.hitTest(x, y);

    expect(hover?.key).toBe('2024-06-03');
    expect(hover?.content.rows[0]).toMatchObject({ label: 'Activity', value: '1' });
    expect(model!.pick?.(x, y)).toEqual({ kind: 'point', fields: ['date'], tuples: [['2024-06-03']] });
  });
});
