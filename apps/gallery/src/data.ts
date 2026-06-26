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
