import type { ChartSpec, DashboardSpec } from 'graphein';
import type { ThemeName } from '../state/theme';

type AnyChartSpec = (ChartSpec | DashboardSpec) & {
  theme?: ThemeName;
  sketch?: unknown;
  dimensions?: unknown;
};

/**
 * Apply the live theme + sketch toggle to a spec and strip any fixed dimensions
 * so the chart fills its (responsive) container. The sketch toggle is
 * authoritative: ON enables it (keeping any richer config the spec carries), OFF
 * strips it so the chart renders clean.
 */
export function applyChartTheme<T extends ChartSpec | DashboardSpec>(
  spec: T,
  theme: ThemeName,
  sketch: boolean,
): T {
  const next = { ...(spec as AnyChartSpec), theme } as AnyChartSpec;
  if (sketch) {
    if (next.sketch == null) next.sketch = true;
  } else {
    delete next.sketch;
  }
  delete next.dimensions;
  return next as T;
}

/** A compact, readable JSON view of a spec: big data arrays + geo are elided. */
export function summarizeSpecJson(spec: ChartSpec | DashboardSpec): string {
  const clone = JSON.parse(
    JSON.stringify(spec, (_k, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)),
  ) as Record<string, unknown>;
  const src = spec as unknown as Record<string, unknown>;
  if (Array.isArray(clone.data) && clone.data.length > 6) {
    clone.data = [...clone.data.slice(0, 4), `…${clone.data.length - 4} more rows`];
  }
  if (clone.geo) {
    const feats = (src.geo as { features?: unknown[] } | undefined)?.features?.length ?? '?';
    clone.geo = `‹GeoFeatureCollection · ${feats} features›`;
  }
  if (Array.isArray(clone.columns) && clone.columns.length > 10) {
    clone.columns = [...clone.columns.slice(0, 8), `…${clone.columns.length - 8} more`];
  }
  return JSON.stringify(clone, null, 2);
}

/** Full, faithful JSON of a spec (Dates → ISO date strings) for the editor / copy. */
export function fullSpecJson(spec: ChartSpec | DashboardSpec): string {
  return JSON.stringify(
    spec,
    (_k, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
    2,
  );
}
