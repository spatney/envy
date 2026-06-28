/**
 * Auto-insight annotations — turn a chart's {@link analyzeChart} facts into
 * on-chart callouts. A cartesian chart opts in with `insights: true` (or an
 * {@link InsightOptions} object); the library finds the notable points (the peak,
 * the trough, statistical outliers, or the top/bottom category) and emits labeled
 * `point` {@link Annotation}s — so an agent never has to reason out *where* the
 * maximum is or hardcode its coordinates.
 *
 * Pure and deterministic: a function of the spec + its data, reusing the same
 * analytical core as {@link summarize}. Multi-series charts are skipped (markers
 * on every series would clutter the plot); use `insights` on a single series.
 */

import type { Annotation, ChartSpec, InsightOptions } from '../spec/types';
import { formatValue } from '../format';
import { analyzeChart, type PointRef } from './insights';

/** Default opt-ins when `insights: true` (or an object omits a flag). */
const DEFAULTS: Required<InsightOptions> = { max: true, min: true, outliers: false };

/** Normalize the `insights` field to concrete flags, or `null` when disabled. */
export function resolveInsightOptions(
  insights: boolean | InsightOptions | undefined,
): Required<InsightOptions> | null {
  if (!insights) return null;
  if (insights === true) return { ...DEFAULTS };
  return {
    max: insights.max ?? DEFAULTS.max,
    min: insights.min ?? DEFAULTS.min,
    outliers: insights.outliers ?? DEFAULTS.outliers,
  };
}

function pointAnnotation(pt: PointRef, label: string): Annotation {
  return { type: 'point', x: (pt.raw ?? pt.label) as Annotation['x'], y: pt.value, label };
}

/**
 * Expand a chart's `insights` option into `point` annotations for its notable
 * data points. Returns `[]` when insights are disabled, the chart has no
 * summarizable trend, or it splits into multiple series.
 */
export function autoInsightAnnotations(spec: ChartSpec): Annotation[] {
  const opts = resolveInsightOptions((spec as { insights?: boolean | InsightOptions }).insights);
  if (!opts) return [];
  const ins = analyzeChart(spec);
  if (!ins) return [];

  const fmt = (v: number): string => formatValue(v, ins.measureFormat);
  const out: Annotation[] = [];
  const used = new Set<number>();

  if (ins.family === 'series') {
    const series = ins.series ?? [];
    if (series.length !== 1) return []; // avoid clutter on multi-series plots
    const s = series[0];
    if (opts.max) {
      out.push(pointAnnotation(s.max, `\u25B2 ${fmt(s.max.value)}`));
      used.add(s.max.index);
    }
    if (opts.min && !used.has(s.min.index)) {
      out.push(pointAnnotation(s.min, `\u25BC ${fmt(s.min.value)}`));
      used.add(s.min.index);
    }
    if (opts.outliers) {
      for (const o of s.outliers) {
        if (used.has(o.index)) continue;
        out.push(pointAnnotation(o, fmt(o.value)));
        used.add(o.index);
      }
    }
    return out;
  }

  if (ins.family === 'category') {
    const c = ins.category;
    if (!c) return [];
    if (opts.max) {
      out.push(pointAnnotation(c.top, `\u25B2 ${fmt(c.top.value)}`));
      used.add(c.top.index);
    }
    if (opts.min && !used.has(c.bottom.index)) {
      out.push(pointAnnotation(c.bottom, `\u25BC ${fmt(c.bottom.value)}`));
    }
    return out;
  }

  return []; // scatter / value / distribution: no point callouts for now
}
