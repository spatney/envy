/**
 * Dashboard auto-wiring — pure spec rewriting that turns a set of views into
 * cross-interacting ones by injecting `params` (sources), `highlight`, and
 * `filter` (consumers) onto each view's spec. Kept side-effect free (no DOM, no
 * store) so it unit-tests in node and the runtime stays a thin shell.
 *
 * Rules (interactions: 'auto'):
 * - A **slicer** publishes a value on its field/param; every other non-slicer
 *   view gets a `filter` clause for it (page-level cross-filter).
 * - A **chart** click publishes a point selection on its key field(s). The
 *   source emphasizes itself (`highlight` on its own param, so it dims the
 *   unpicked marks rather than hiding them), and **every other view** gets a
 *   `filter` clause for that param (Power BI–style cross-filter of the page).
 */

import type {
  BaseSlicerSpec,
  ChartSpec,
  Encoding,
  FieldDef,
} from '../spec/types';
import { SLICER_TYPES } from '../spec/types';
import type {
  DashboardView,
  InteractionLink,
} from '../spec/dashboard';
import type {
  FilterClause,
  HighlightConfig,
  SelectionParam,
} from '../spec/selection';

/** Chart types that support a click → point selection (mirror of `pick()`). */
const PICKABLE = new Set<ChartSpec['type']>(['bar', 'area', 'line', 'scatter', 'pie', 'heatmap', 'box']);

export function isSlicerType(type: ChartSpec['type']): boolean {
  return (SLICER_TYPES as readonly string[]).includes(type);
}

function fieldOf(channel: FieldDef | undefined): string | undefined {
  return channel && typeof channel.field === 'string' ? channel.field : undefined;
}

/** Every data field a chart's encoding references (used to test "uses field"). */
export function specFields(spec: ChartSpec): Set<string> {
  const out = new Set<string>();
  if (isSlicerType(spec.type)) {
    const f = (spec as BaseSlicerSpec).field;
    if (f) out.add(f);
    return out;
  }
  const enc = (spec as { encoding?: Encoding }).encoding;
  if (enc) {
    for (const key of Object.keys(enc) as (keyof Encoding)[]) {
      const f = fieldOf(enc[key]);
      if (f) out.add(f);
    }
  }
  return out;
}

/** The field(s) a click on this chart selects (mirror of each model's `pick`). */
export function keyFields(spec: ChartSpec): string[] {
  const enc = (spec as { encoding?: Encoding }).encoding ?? {};
  switch (spec.type) {
    case 'bar':
    case 'area':
    case 'line':
    case 'box': {
      const x = fieldOf(enc.x);
      return x ? [x] : [];
    }
    case 'scatter': {
      const series = fieldOf(enc.series) ?? fieldOf(enc.color);
      if (series) return [series];
      const x = fieldOf(enc.x);
      const y = fieldOf(enc.y);
      return x && y ? [x, y] : [];
    }
    case 'pie': {
      const c = fieldOf(enc.color);
      return c ? [c] : [];
    }
    case 'heatmap': {
      const x = fieldOf(enc.x);
      const y = fieldOf(enc.y);
      return x && y ? [x, y] : [];
    }
    default:
      return [];
  }
}

/** The param a slicer publishes to (explicit `param`, else its field). */
export function slicerParamName(spec: BaseSlicerSpec): string {
  return spec.param ?? spec.field;
}

// ---- spec mutation helpers (return new objects; never mutate inputs) --------

function addParam(spec: ChartSpec, param: SelectionParam): ChartSpec {
  const params = spec.params ? [...spec.params] : [];
  if (params.some((p) => p.name === param.name)) return spec;
  return { ...spec, params: [...params, param] } as ChartSpec;
}

function addHighlight(spec: ChartSpec, paramName: string): ChartSpec {
  const existing = spec.highlight;
  const list: HighlightConfig[] = existing
    ? Array.isArray(existing)
      ? [...existing]
      : [existing]
    : [];
  if (list.some((h) => h.param === paramName)) return spec;
  list.push({ param: paramName });
  return { ...spec, highlight: list } as ChartSpec;
}

function addFilterParam(spec: ChartSpec, paramName: string): ChartSpec {
  const filter: FilterClause[] = spec.filter ? [...spec.filter] : [];
  if (filter.some((c) => 'param' in c && c.param === paramName)) return spec;
  filter.push({ param: paramName });
  return { ...spec, filter } as ChartSpec;
}

interface WiredSource {
  /** The view index this source belongs to. */
  view: number;
  /** The published param name. */
  param: string;
  /** Identity fields of the selection. */
  fields: string[];
  /** 'filter' (slicers) or 'highlight' (charts) by default. */
  as: 'filter' | 'highlight';
  /** True for slicer sources (already publish on their own). */
  slicer: boolean;
}

/** Source param name auto-assigned to a pickable chart that has no param yet. */
function autoParamName(view: DashboardView): string {
  const existing = view.spec.params?.[0]?.name;
  return existing ?? `__sel__${view.id}`;
}

/**
 * Rewrite a dashboard's views, injecting the params/highlight/filter that
 * implement the requested cross-interaction. Returns new view objects with new
 * specs; inputs are not mutated.
 */
export function wireViews(
  views: DashboardView[],
  interactions: 'auto' | 'none' | InteractionLink[] | undefined,
): DashboardView[] {
  const out = views.map((v) => ({ ...v, spec: v.spec }));
  if (interactions === 'none') return out;

  // 1) Resolve the source param for every view that can drive an interaction.
  const sources: WiredSource[] = [];
  out.forEach((v, i) => {
    const type = v.spec.type;
    if (isSlicerType(type)) {
      const s = v.spec as BaseSlicerSpec;
      sources.push({
        view: i,
        param: slicerParamName(s),
        fields: [s.field],
        as: s.as ?? 'filter',
        slicer: true,
      });
    } else if (PICKABLE.has(type)) {
      const fields = keyFields(v.spec);
      if (fields.length === 0) return;
      const param = autoParamName(v);
      sources.push({ view: i, param, fields, as: 'highlight', slicer: false });
    }
  });

  const explicit = Array.isArray(interactions);
  const byId = new Map(out.map((v, i) => [v.id, i]));

  if (!explicit) {
    // 2a) AUTO (Power BI–style): every source cross-filters the whole page
    // (filtering just subsets rows, so it's meaningful for every view, e.g. a
    // KPI or table). A chart source additionally self-highlights so it dims its
    // unpicked marks instead of hiding them; a source never filters itself.
    for (const src of sources) {
      // Pickable chart sources need a param injected so clicks publish, plus a
      // highlight on themselves so the unpicked marks dim (e.g. pie slices).
      if (!src.slicer) {
        out[src.view].spec = addParam(out[src.view].spec, {
          name: src.param,
          select: { type: 'point', on: 'click', fields: src.fields },
        });
        out[src.view].spec = addHighlight(out[src.view].spec, src.param);
      }
      out.forEach((v, j) => {
        if (isSlicerType(v.spec.type)) return; // slicers aren't highlight/filter targets
        if (j === src.view) return; // a source filters the rest of the page, not itself
        out[j].spec = addFilterParam(out[j].spec, src.param);
      });
    }
    return out;
  }

  // 2b) EXPLICIT links replace auto-wiring.
  const sourceByView = new Map(sources.map((s) => [s.view, s]));
  for (const link of interactions as InteractionLink[]) {
    const si = byId.get(link.source);
    if (si == null) continue;
    const src = sourceByView.get(si);
    const fields = link.fields ?? src?.fields ?? keyFields(out[si].spec);
    const as = link.as ?? src?.as ?? 'highlight';
    if (as === 'none' || fields.length === 0) continue;
    const param =
      src?.param ??
      (() => {
        const name = autoParamName(out[si]);
        out[si].spec = addParam(out[si].spec, {
          name,
          select: { type: 'point', on: 'click', fields },
        });
        return name;
      })();
    // A chart source still needs its publishing param injected.
    if (src && !src.slicer) {
      out[si].spec = addParam(out[si].spec, {
        name: param,
        select: { type: 'point', on: 'click', fields },
      });
    }
    const targets =
      link.target === '*'
        ? out.map((_, j) => j).filter((j) => j !== si)
        : (Array.isArray(link.target) ? link.target : [link.target])
            .map((id) => byId.get(id))
            .filter((j): j is number => j != null);
    for (const t of targets) {
      if (isSlicerType(out[t].spec.type)) continue;
      if (as === 'filter') out[t].spec = addFilterParam(out[t].spec, param);
      else out[t].spec = addHighlight(out[t].spec, param);
    }
  }
  return out;
}
