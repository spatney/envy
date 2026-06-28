/**
 * Seeded, deterministic mock data generators for the gallery + screenshot
 * harness. Deterministic output keeps screenshots stable across runs.
 */

export type Datum = Record<string, unknown>;

/** mulberry32 — tiny, fast, deterministic PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(r: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = r();
  while (v === 0) v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface TimeSeriesOptions {
  series?: string[];
  points?: number;
  start?: Date;
  stepDays?: number;
  base?: number;
  trend?: number;
  seasonAmp?: number;
  noise?: number;
  seed?: number;
  /** Field name for the value column. */
  valueField?: string;
}

/** Tidy time series: one row per (date, series). */
export function timeSeries(opts: TimeSeriesOptions = {}): Datum[] {
  const {
    series = ['Series A'],
    points = 60,
    start = new Date(2023, 0, 1),
    stepDays = 7,
    base = 100,
    trend = 0.8,
    seasonAmp = 18,
    noise = 8,
    seed = 1,
    valueField = 'value',
  } = opts;
  const out: Datum[] = [];
  series.forEach((name, si) => {
    const r = rng(seed + si * 1000);
    let level = base * (1 + si * 0.35);
    for (let i = 0; i < points; i++) {
      const date = new Date(start.getTime() + i * stepDays * 86_400_000);
      level += trend + gaussian(r) * noise * 0.35;
      const season = Math.sin((i / points) * Math.PI * 4 + si) * seasonAmp;
      const value = Math.max(0, level + season + gaussian(r) * noise);
      out.push({ date, series: name, [valueField]: round(value) });
    }
  });
  return out;
}

export interface CategoricalOptions {
  categories?: string[];
  series?: string[];
  base?: number;
  noise?: number;
  seed?: number;
  valueField?: string;
  categoryField?: string;
}

/** Tidy categorical data: one row per (category, series). */
export function categorical(opts: CategoricalOptions = {}): Datum[] {
  const {
    categories = ['Q1', 'Q2', 'Q3', 'Q4'],
    series = ['Revenue'],
    base = 240,
    noise = 80,
    seed = 7,
    valueField = 'value',
    categoryField = 'category',
  } = opts;
  const out: Datum[] = [];
  series.forEach((name, si) => {
    const r = rng(seed + si * 97);
    categories.forEach((cat, ci) => {
      const value = Math.max(
        4,
        base * (1 + si * 0.2) + Math.sin(ci) * noise * 0.5 + (r() - 0.4) * noise,
      );
      out.push({ [categoryField]: cat, series: name, [valueField]: round(value) });
    });
  });
  return out;
}

export interface ScatterOptions {
  n?: number;
  groups?: string[];
  seed?: number;
}

/** Scatter points with optional groups and a size field. */
export function scatter(opts: ScatterOptions = {}): Datum[] {
  const { n = 120, groups = ['Group 1'], seed = 11 } = opts;
  const out: Datum[] = [];
  groups.forEach((g, gi) => {
    const r = rng(seed + gi * 313);
    const cx = 30 + gi * 22 + r() * 10;
    const cy = 40 + gi * 14;
    for (let i = 0; i < n; i++) {
      const x = cx + gaussian(r) * 16;
      const y = cy + gaussian(r) * 14 + x * 0.35;
      out.push({ x: round(x), y: round(y), group: g, size: round(4 + Math.abs(gaussian(r)) * 18) });
    }
  });
  return out;
}

/** Wide 2D matrix for heatmaps: rows × cols with a numeric value. */
export function heatmapGrid(opts: { rows?: string[]; cols?: string[]; seed?: number } = {}): Datum[] {
  const {
    rows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    cols = Array.from({ length: 24 }, (_, h) => `${h}:00`),
    seed = 21,
  } = opts;
  const out: Datum[] = [];
  const r = rng(seed);
  rows.forEach((row, ri) => {
    cols.forEach((col, ci) => {
      const peak = Math.exp(-((ci - 13) ** 2) / 30) * (ri < 5 ? 1 : 0.4);
      const value = round(peak * 80 + r() * 20);
      out.push({ day: row, hour: col, value });
    });
  });
  return out;
}

/** Rich tabular data for the data table / matrix. */
export function salesTable(opts: { n?: number; seed?: number } = {}): Datum[] {
  const { n = 200, seed = 31 } = opts;
  const r = rng(seed);
  const regions = ['West', 'East', 'North', 'South'];
  const categories = ['Furniture', 'Office Supplies', 'Technology'];
  const segments = ['Consumer', 'Corporate', 'Home Office'];
  const out: Datum[] = [];
  for (let i = 0; i < n; i++) {
    const sales = round(20 + Math.abs(gaussian(r)) * 800);
    const margin = round((0.1 + r() * 0.45) * sales);
    out.push({
      order: `ORD-${(1000 + i).toString()}`,
      date: new Date(2023, 0, 1 + Math.floor(r() * 540)),
      region: regions[Math.floor(r() * regions.length)],
      category: categories[Math.floor(r() * categories.length)],
      segment: segments[Math.floor(r() * segments.length)],
      units: Math.ceil(r() * 40),
      sales,
      profit: round(margin - sales * 0.05),
      margin: round(margin / sales, 3),
    });
  }
  return out;
}

function round(v: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

export interface BoxOptions {
  categories?: string[];
  series?: string[];
  /** Observations per (category, series). */
  n?: number;
  seed?: number;
  base?: number;
  spread?: number;
  categoryField?: string;
  valueField?: string;
}

/**
 * Tidy distributions for box plots: many raw observations per category (and
 * optional series). Each category gets a distinct center + spread, with a few
 * deliberate outliers so the Tukey whiskers have something to exclude.
 */
export function boxDistributions(opts: BoxOptions = {}): Datum[] {
  const {
    categories = ['Alpha', 'Bravo', 'Charlie', 'Delta'],
    series = ['Series A'],
    n = 80,
    seed = 41,
    base = 60,
    spread = 14,
    categoryField = 'category',
    valueField = 'value',
  } = opts;
  const out: Datum[] = [];
  series.forEach((name, si) => {
    categories.forEach((cat, ci) => {
      const r = rng(seed + si * 131 + ci * 17);
      const center = base + Math.sin(ci * 0.9 + si) * spread + si * spread * 0.8;
      const sd = spread * (0.6 + (ci % 3) * 0.25 + si * 0.1);
      for (let i = 0; i < n; i++) {
        let v = center + gaussian(r) * sd;
        if (r() < 0.04) v += (r() < 0.5 ? -1 : 1) * sd * (3 + r() * 2);
        out.push({ [categoryField]: cat, series: name, [valueField]: round(Math.max(0, v)) });
      }
    });
  });
  return out;
}

/** Link rows {source, target, value} for Sankey diagrams. */
export function sankeyFlows(variant: 'energy' | 'budget' = 'energy'): Datum[] {
  if (variant === 'budget') {
    return [
      { source: 'Revenue', target: 'Gross profit', value: 640 },
      { source: 'Revenue', target: 'Cost of sales', value: 360 },
      { source: 'Gross profit', target: 'Operating profit', value: 420 },
      { source: 'Gross profit', target: 'Operating costs', value: 220 },
      { source: 'Operating profit', target: 'Net income', value: 300 },
      { source: 'Operating profit', target: 'Tax', value: 120 },
      { source: 'Operating costs', target: 'R&D', value: 120 },
      { source: 'Operating costs', target: 'Sales & marketing', value: 100 },
    ];
  }
  return [
    { source: 'Coal', target: 'Electricity', value: 120 },
    { source: 'Gas', target: 'Electricity', value: 90 },
    { source: 'Gas', target: 'Heat', value: 70 },
    { source: 'Nuclear', target: 'Electricity', value: 80 },
    { source: 'Wind', target: 'Electricity', value: 60 },
    { source: 'Solar', target: 'Electricity', value: 35 },
    { source: 'Hydro', target: 'Electricity', value: 25 },
    { source: 'Imports', target: 'Electricity', value: 20 },
    { source: 'Electricity', target: 'Residential', value: 170 },
    { source: 'Electricity', target: 'Commercial', value: 140 },
    { source: 'Electricity', target: 'Industry', value: 120 },
    { source: 'Heat', target: 'Residential', value: 40 },
    { source: 'Heat', target: 'Commercial', value: 30 },
  ];
}

/** One numeric value per join key (e.g. US state name) for choropleths. */
export function choroplethMetric(
  keys: string[],
  opts: { seed?: number; base?: number; keyField?: string; valueField?: string } = {},
): Datum[] {
  const { seed = 51, base = 50, keyField = 'name', valueField = 'value' } = opts;
  const r = rng(seed);
  return keys.map((k) => ({
    [keyField]: k,
    [valueField]: round(base + Math.abs(gaussian(r)) * base * 1.6),
  }));
}
