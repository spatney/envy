import { describe, expect, it } from 'vitest';
import { planPieLabels, type PieLabelInput, type PlanPieLabelsOptions } from './pieLabels';

const TAU = Math.PI * 2;

function inputs(shares: number[]): PieLabelInput[] {
  let angle = 0;
  return shares.map((share, index) => {
    const startAngle = angle;
    const endAngle = index === shares.length - 1 ? TAU : angle + share * TAU;
    angle = endAngle;
    return { index, label: `S${index}`, value: share * 1000, share, startAngle, endAngle };
  });
}

function baseOptions(over: Partial<PlanPieLabelsOptions> = {}): PlanPieLabelsOptions {
  return {
    slices: inputs([0.5, 0.3, 0.15, 0.05]),
    cx: 200,
    cy: 150,
    outerR: 120,
    innerR: 0,
    area: { x: 0, y: 0, width: 400, height: 300 },
    placement: 'auto',
    minShare: 0.01,
    lineHeight: 16,
    measure: (t) => t.length * 7,
    formatValue: (v) => String(Math.round(v)),
    ...over,
  };
}

describe('planPieLabels', () => {
  it('keeps every label inside and leaves geometry untouched for placement:inside', () => {
    const plan = planPieLabels(baseOptions({ placement: 'inside' }));
    expect(plan.outside).toHaveLength(0);
    expect(plan.inside).toHaveLength(4);
    expect(plan.outerR).toBe(120);
    expect(plan.innerR).toBe(0);
    expect(plan.cx).toBe(200);
  });

  it('pushes every label outside for placement:outside', () => {
    const plan = planPieLabels(baseOptions({ placement: 'outside' }));
    expect(plan.inside).toHaveLength(0);
    expect(plan.outside).toHaveLength(4);
    for (const o of plan.outside) {
      expect(o.points).toHaveLength(3);
      expect(o.align).toBe(o.side === 'right' ? 'left' : 'right');
    }
  });

  it('reserves room by shrinking the pie when labels go outside', () => {
    const plan = planPieLabels(baseOptions({ placement: 'outside', outerR: 190 }));
    expect(plan.outerR).toBeLessThan(190);
    expect(plan.outerR).toBeGreaterThan(0);
  });

  it('keeps outside callouts within the drawing area', () => {
    const opt = baseOptions({ placement: 'outside' });
    const plan = planPieLabels(opt);
    for (const o of plan.outside) {
      expect(o.y).toBeGreaterThanOrEqual(opt.area.y);
      expect(o.y).toBeLessThanOrEqual(opt.area.y + opt.area.height);
    }
  });

  it('separates collided labels on the same side by at least a line height', () => {
    const opt = baseOptions({ placement: 'outside' });
    const plan = planPieLabels(opt);
    for (const side of ['left', 'right'] as const) {
      const ys = plan.outside
        .filter((o) => o.side === side)
        .map((o) => o.y)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(opt.lineHeight - 1e-6);
      }
    }
  });

  it('auto-places a dominant slice inside and a sliver outside', () => {
    const plan = planPieLabels(baseOptions({ slices: inputs([0.7, 0.28, 0.02]), placement: 'auto' }));
    const inside = new Set(plan.inside.map((l) => l.index));
    const outside = new Set(plan.outside.map((l) => l.index));
    expect(inside.has(0)).toBe(true); // 70% slice
    expect(outside.has(2)).toBe(true); // 2% sliver
  });

  it('drops labels below minShare', () => {
    const plan = planPieLabels(
      baseOptions({ slices: inputs([0.6, 0.39, 0.005, 0.005]), placement: 'outside', minShare: 0.01 }),
    );
    const labelled = new Set([...plan.inside, ...plan.outside].map((l) => l.index));
    expect(labelled.has(2)).toBe(false);
    expect(labelled.has(3)).toBe(false);
    expect(labelled.size).toBe(2);
  });

  it('honours the content selector', () => {
    const plan = planPieLabels(baseOptions({ placement: 'outside', content: 'category' }));
    expect(plan.outside.every((o) => /^S\d$/.test(o.text))).toBe(true);
  });
});
