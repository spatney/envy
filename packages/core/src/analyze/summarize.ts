/**
 * Deterministic natural-language chart summaries — the chart explains itself.
 *
 * {@link summarize} turns the structured facts from {@link analyzeChart} into one
 * or two plain-English sentences ("Users rose 46% from 4,200 to 6,150…"). It is
 * a pure, LLM-free function of the spec, so the same string is reproducible in a
 * report, an email, or — crucially — as the alt-text behind a canvas chart.
 *
 * Returns `''` for chart types that carry no summarizable trend (tables, maps,
 * sankey), so callers can treat an empty string as "nothing worth narrating".
 */

import type { ChartSpec } from '../spec/types';
import { formatValue } from '../format';
import {
  analyzeChart,
  type ChartInsights,
  type SeriesInsights,
} from './insights';

const EN_DASH = '\u2013';

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function pctText(p: number): string {
  return `${Math.round(Math.abs(p) * 100)}%`;
}

/** A formatter bound to the chart's measure format hint. */
function formatter(ins: ChartInsights): (v: number) => string {
  const hint = ins.measureFormat;
  return (v: number) => formatValue(v, hint);
}

function summarizeSeries(ins: ChartInsights): string {
  const series = ins.series ?? [];
  const fmt = formatter(ins);
  const measure = cap(ins.measureLabel ?? ins.measureField ?? 'Value');

  if (series.length === 1) {
    const s = series[0];
    if (s.count === 1) return `${measure} is ${fmt(s.first.value)}.`;

    const span =
      s.first.label && s.last.label && s.first.label !== s.last.label
        ? ` between ${s.first.label} and ${s.last.label}`
        : '';

    if (s.direction === 'flat') {
      return `${measure} held steady around ${fmt(s.mean)}${span}.`;
    }

    const verb = s.direction === 'up' ? 'rose' : 'fell';
    const change = s.pctChange !== null ? pctText(s.pctChange) : `${fmt(Math.abs(s.netChange))}`;
    let out = `${measure} ${verb} ${change} from ${fmt(s.first.value)} to ${fmt(s.last.value)}${span}`;

    const peakIsInterior = s.max.index !== s.last.index && s.max.index !== s.first.index;
    if (s.direction === 'up' && peakIsInterior && s.max.value > s.last.value) {
      out += `, peaking at ${fmt(s.max.value)} in ${s.max.label}`;
    } else if (s.direction === 'down' && s.min.index !== s.last.index && s.min.index !== s.first.index && s.min.value < s.last.value) {
      out += `, bottoming at ${fmt(s.min.value)} in ${s.min.label}`;
    }
    return `${out}.`;
  }

  if (series.length > 1 && ins.leader && ins.biggestMover) {
    const moverSeries = series.find((s) => s.key === ins.biggestMover!.key) as SeriesInsights | undefined;
    const moveDelta = ins.biggestMover.delta;
    const moveVerb = moveDelta > 0 ? 'rose' : moveDelta < 0 ? 'fell' : 'held steady';
    let out = `Across ${series.length} series, ${ins.leader.key} leads at ${fmt(ins.leader.value)}`;
    if (moverSeries && moveDelta !== 0 && ins.biggestMover.key !== ins.leader.key) {
      out += `; ${ins.biggestMover.key} ${moveVerb} the most (${moveDelta > 0 ? '+' : '-'}${fmt(Math.abs(moveDelta))})`;
    } else if (moverSeries && moveDelta !== 0) {
      out += ` and ${moveVerb} the most (${moveDelta > 0 ? '+' : '-'}${fmt(Math.abs(moveDelta))})`;
    }
    return `${out}.`;
  }

  return '';
}

function summarizeCategory(ins: ChartInsights): string {
  const c = ins.category;
  if (!c) return '';
  const fmt = formatter(ins);
  const share = `${Math.round(c.topShare * 100)}%`;
  let out = `${cap(c.top.label)} is the largest at ${fmt(c.top.value)} (${share} of the ${fmt(c.total)} total)`;
  if (c.count > 1 && c.bottom.label !== c.top.label) {
    out += `, ${c.bottom.label} the smallest at ${fmt(c.bottom.value)}`;
  }
  return `${out}.`;
}

function summarizeScatter(ins: ChartInsights): string {
  const sc = ins.scatter;
  if (!sc) return '';
  const fmt = formatter(ins);
  const xName = ins.categoryField ?? 'x';
  const yName = ins.measureLabel ?? ins.measureField ?? 'y';
  const r = sc.correlation;
  let corr = '';
  if (r !== null) {
    const strength = Math.abs(r) > 0.6 ? 'strong' : Math.abs(r) > 0.3 ? 'moderate' : Math.abs(r) > 0.1 ? 'weak' : null;
    corr = strength ? `, a ${strength} ${r > 0 ? 'positive' : 'negative'} correlation` : ', little correlation';
  }
  return `${sc.count} points; ${xName} ranges ${formatValue(sc.xExtent[0])}${EN_DASH}${formatValue(sc.xExtent[1])} and ${yName} ${fmt(sc.yExtent[0])}${EN_DASH}${fmt(sc.yExtent[1])}${corr}.`;
}

function summarizeValue(ins: ChartInsights): string {
  const v = ins.value;
  if (!v) return '';
  const fmt = formatter(ins);
  const label = cap(ins.measureLabel ?? 'Value');
  let out = `${label} is ${fmt(v.value)}`;
  if (v.target !== null) {
    const rel = v.value > v.target ? 'above' : v.value < v.target ? 'below' : 'on';
    out += `, ${rel} the target of ${fmt(v.target)}`;
  }
  return `${out}.`;
}

function summarizeDistribution(ins: ChartInsights): string {
  const d = ins.distribution;
  if (!d) return '';
  const fmt = formatter(ins);
  const field = ins.measureLabel ?? ins.measureField ?? 'values';
  return `${d.count} ${field} values ranging ${fmt(d.min.value)}${EN_DASH}${fmt(d.max.value)}, averaging ${fmt(d.mean)}.`;
}

/**
 * Build a deterministic, plain-English summary of what a chart's data shows.
 * Doubles as alt-text. Returns `''` when the chart type isn't summarizable.
 */
export function summarize(spec: ChartSpec): string {
  const ins = analyzeChart(spec);
  if (!ins) return '';
  switch (ins.family) {
    case 'series':
      return summarizeSeries(ins);
    case 'category':
      return summarizeCategory(ins);
    case 'scatter':
      return summarizeScatter(ins);
    case 'value':
      return summarizeValue(ins);
    case 'distribution':
      return summarizeDistribution(ins);
    default:
      return '';
  }
}
