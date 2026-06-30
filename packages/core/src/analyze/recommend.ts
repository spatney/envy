import type { ChartSpec, Encoding, FieldDef } from '../spec/types';
import { validateSpec } from '../spec/validate';
import type { Datum } from '../types';
import { inferType, uniqueValues } from '../util/data';

export interface ColumnProfile {
  field: string;
  type: 'quantitative' | 'temporal' | 'nominal' | 'ordinal';
  cardinality: number;
}

export interface RecommendedChart {
  spec: ChartSpec;
  score: number;
  rationale: string;
}

export interface RecommendOptions {
  intent?: 'trend' | 'comparison' | 'distribution' | 'relationship' | 'composition';
  maxResults?: number;
}

type Intent = NonNullable<RecommendOptions['intent']>;
type Family = Intent | 'density' | 'value';

interface Candidate {
  spec: ChartSpec;
  score: number;
  rationale: string;
  family: Family;
}

export function profileColumns(data: Datum[]): ColumnProfile[] {
  const fields = new Set<string>();
  for (const row of data) {
    for (const field of Object.keys(row)) fields.add(field);
  }
  return [...fields].map((field) => ({
    field,
    type: inferType(data, field),
    cardinality: uniqueValues(data, field).length,
  }));
}

function title(text: string): string {
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function fieldDef(profile: ColumnProfile): FieldDef {
  return { field: profile.field, type: profile.type };
}

function boost(score: number, family: Family, intent?: Intent): number {
  if (!intent) return score;
  const matches =
    family === intent ||
    (intent === 'composition' && family === 'comparison') ||
    (intent === 'comparison' && family === 'density');
  return Math.min(1, score + (matches ? 0.12 : 0));
}

function pushValid(candidates: Candidate[], candidate: Candidate, intent?: Intent) {
  const score = Number(boost(candidate.score, candidate.family, intent).toFixed(3));
  const spec = candidate.spec;
  if (!validateSpec(spec).valid) return;
  candidates.push({ ...candidate, score });
}

function firstLowCardNominal(profiles: ColumnProfile[], exclude = new Set<string>()): ColumnProfile | undefined {
  return profiles.find((p) => p.type === 'nominal' && p.cardinality <= 12 && !exclude.has(p.field));
}

export function recommendChart(data: Datum[], opts: RecommendOptions = {}): RecommendedChart[] {
  if (!Array.isArray(data) || data.length === 0) return [];

  const profiles = profileColumns(data);
  const quantitative = profiles.filter((p) => p.type === 'quantitative');
  const ordered = profiles.filter((p) => p.type === 'temporal' || p.type === 'ordinal');
  const nominal = profiles.filter((p) => p.type === 'nominal');
  const lowNominal = nominal.filter((p) => p.cardinality <= 12);
  const manyNominal = nominal.filter((p) => p.cardinality > 12);
  const candidates: Candidate[] = [];
  const measure = quantitative[0];

  if (ordered.length > 0 && measure) {
    const x = ordered[0];
    const encoding: Encoding & { x: FieldDef; y: FieldDef } = { x: fieldDef(x), y: fieldDef(measure) };
    const series = firstLowCardNominal(profiles, new Set([x.field, measure.field]));
    if (series) encoding.series = fieldDef(series);
    pushValid(
      candidates,
      {
        spec: {
          type: 'line',
          data,
          encoding,
          title: `${title(measure.field)} over ${title(x.field)}`,
        } as ChartSpec,
        score: 0.92,
        family: 'trend',
        rationale: `${title(x.field)} is ${x.type}, so a line chart shows how ${title(measure.field)} changes over ordered rows${series ? `, split by low-cardinality ${title(series.field)}` : ''}.`,
      },
      opts.intent,
    );
  }

  if (measure) {
    const category = lowNominal[0];
    if (category) {
      pushValid(
        candidates,
        {
          spec: {
            type: 'bar',
            data,
            encoding: { x: fieldDef(category), y: fieldDef(measure) },
            title: `${title(measure.field)} by ${title(category.field)}`,
          } as ChartSpec,
          score: 0.84,
          family: 'comparison',
          rationale: `${title(category.field)} has ${category.cardinality} categories, making bars a good comparison of ${title(measure.field)}.`,
        },
        opts.intent,
      );
      if (category.cardinality <= 7) {
        pushValid(
          candidates,
          {
            spec: {
              type: 'pie',
              data,
              encoding: { theta: fieldDef(measure), color: fieldDef(category) },
              title: `${title(measure.field)} share by ${title(category.field)}`,
            } as ChartSpec,
            score: 0.58,
            family: 'composition',
            rationale: `${title(category.field)} has ${category.cardinality} slices, so a pie can show part-to-whole share for ${title(measure.field)}.`,
          },
          opts.intent,
        );
      }
    } else if (manyNominal.length > 0) {
      const wideCategory = manyNominal[0];
      pushValid(
        candidates,
        {
          spec: {
            type: 'bar',
            data,
            encoding: { x: fieldDef(wideCategory), y: fieldDef(measure) },
            title: `${title(measure.field)} by ${title(wideCategory.field)}`,
          } as ChartSpec,
          score: 0.62,
          family: 'comparison',
          rationale: `${title(wideCategory.field)} has ${wideCategory.cardinality} categories; use this bar chart with top-N filtering or grouping to keep labels readable.`,
        },
        opts.intent,
      );
    }
  }

  if (quantitative.length >= 2) {
    const [x, y] = quantitative;
    const encoding: Encoding & { x: FieldDef; y: FieldDef } = { x: fieldDef(x), y: fieldDef(y) };
    const size = quantitative[2];
    const color = firstLowCardNominal(profiles, new Set([x.field, y.field]));
    if (size) encoding.size = fieldDef(size);
    if (color) encoding.color = fieldDef(color);
    pushValid(
      candidates,
      {
        spec: {
          type: 'scatter',
          data,
          encoding,
          title: `${title(y.field)} vs ${title(x.field)}`,
        } as ChartSpec,
        score: 0.86,
        family: 'relationship',
        rationale: `${title(x.field)} and ${title(y.field)} are quantitative, so scatter reveals their relationship${size ? ` with ${title(size.field)} as bubble size` : ''}${color ? ` and ${title(color.field)} as color` : ''}.`,
      },
      opts.intent,
    );
  }

  if (quantitative.length === 1) {
    const q = quantitative[0];
    pushValid(
      candidates,
      {
        spec: {
          type: 'histogram',
          data,
          encoding: { x: fieldDef(q) },
          title: `${title(q.field)} distribution`,
        } as ChartSpec,
        score: 0.78,
        family: 'distribution',
        rationale: `${title(q.field)} is the only quantitative field, so a histogram shows its distribution.`,
      },
      opts.intent,
    );
    pushValid(
      candidates,
      {
        spec: {
          type: 'kpi',
          data,
          value: { field: q.field, aggregate: 'sum' },
          label: `Total ${title(q.field)}`,
          title: `Total ${title(q.field)}`,
        } as ChartSpec,
        score: 0.62,
        family: 'value',
        rationale: `${title(q.field)} is the only quantitative field, so a KPI summarizes it as a total.`,
      },
      opts.intent,
    );
  }

  if (lowNominal.length >= 2 && measure) {
    const [x, y] = lowNominal;
    pushValid(
      candidates,
      {
        spec: {
          type: 'heatmap',
          data,
          encoding: { x: fieldDef(x), y: fieldDef(y), color: fieldDef(measure) },
          title: `${title(measure.field)} by ${title(x.field)} and ${title(y.field)}`,
        } as ChartSpec,
        score: 0.76,
        family: 'density',
        rationale: `${title(x.field)} and ${title(y.field)} are low-cardinality categories, so a heatmap shows ${title(measure.field)} across their combinations.`,
      },
      opts.intent,
    );
    pushValid(
      candidates,
      {
        spec: {
          type: 'matrix',
          data,
          rows: [y.field],
          columns: [x.field],
          values: [{ field: measure.field, op: 'sum' }],
          title: `${title(measure.field)} matrix`,
        } as ChartSpec,
        score: 0.68,
        family: 'density',
        rationale: `A matrix summarizes ${title(measure.field)} by ${title(y.field)} rows and ${title(x.field)} columns.`,
      },
      opts.intent,
    );
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.maxResults ?? 5)
    .map(({ spec, score, rationale }) => ({ spec, score, rationale }));
}
