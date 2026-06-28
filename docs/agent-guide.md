# Graphein Agent Guide

A practical playbook for **coding agents** that generate Graphein charts and dashboards.
Graphein is built for you: one chart = one JSON‑serializable [`ChartSpec`](./spec-reference.md),
no callbacks, sensible defaults, and good visuals at any size.

## The one rule

> Emit a single JSON object with a `type`, a `data` array of flat records, and
> (for cartesian charts) an `encoding` that names the columns.

```ts
import { render } from 'graphein';
render('#chart', {
  type: 'bar',
  data: [
    { quarter: 'Q1', revenue: 210 },
    { quarter: 'Q2', revenue: 245 },
    { quarter: 'Q3', revenue: 268 },
    { quarter: 'Q4', revenue: 290 },
  ],
  encoding: { x: { field: 'quarter' }, y: { field: 'revenue', format: '$,d' } },
  title: 'Quarterly revenue',
});
```

## Shape your data as a tidy table

Graphein expects **long/tidy** data: one row per observation, one column per variable.
The *same* table drives every chart — you just point different channels at columns.

✅ Tidy (preferred):

```json
[
  { "quarter": "Q1", "region": "West", "revenue": 210 },
  { "quarter": "Q1", "region": "East", "revenue": 180 }
]
```

🚫 Wide (don't pre‑pivot for charts — let `series` split it, or use a `matrix`):

```json
[{ "quarter": "Q1", "West": 210, "East": 180 }]
```

To compare groups, add a `series` channel (line/area/bar) instead of widening:
`"series": { "field": "region" }`.

## Reshape data in the spec with `transform`

The #1 way agents get a chart wrong is **mis‑shaping the data array** — charting
raw rows that needed aggregating, filtering, or pivoting first. Don't massage rows
in code. Add a `transform` pipeline to the spec and let Graphein reshape `data`
*before* it charts. It's plain JSON, it's validated, and a chart's encodings can
reference the columns a transform produces.

```json
{
  "type": "line",
  "data": [
    { "ts": "2024-01-03", "region": "West", "amount": 12 },
    { "ts": "2024-01-19", "region": "West", "amount": 18 },
    { "ts": "2024-02-08", "region": "East", "amount": 9 }
  ],
  "transform": [
    { "filter": { "field": "amount", "gt": 0 } },
    { "timeUnit": "month", "field": "ts", "as": "month" },
    { "aggregate": [ { "op": "sum", "field": "amount", "as": "amount" } ], "groupby": ["month", "region"] }
  ],
  "encoding": { "x": { "field": "month", "type": "temporal" }, "y": { "field": "amount" }, "series": { "field": "region" } }
}
```

Steps run top‑to‑bottom; each step has exactly one operator key:

| Need | Step |
| --- | --- |
| One row per bar/point (sum, mean, count…) | `{ "aggregate": [{ "op": "sum", "field": "x", "as": "x" }], "groupby": ["cat"] }` |
| Keep a subset of rows | `{ "filter": { "field": "year", "gte": 2020 } }` (compose with `and`/`or`/`not`) |
| Group a timestamp by period | `{ "timeUnit": "month", "field": "ts", "as": "month" }` |
| Bucket a number (distribution) | `{ "bin": "price", "as": ["lo", "hi"], "maxbins": 20 }` |
| Wide → long (so `series` can split it) | `{ "fold": ["West", "East"], "as": ["region", "amount"] }` |
| Derive a column (ratio, label, bucket) | `{ "calculate": "round(revenue / users, 2)", "as": "arpu" }` |

Rules of thumb: **pre‑aggregate with a `transform` so there's exactly one row per
mark** (cartesian charts plot rows as‑is); reach for `fold` instead of pre‑pivoting;
filter in the spec so the same raw `data` can feed several views. Full field‑by‑field
reference: [spec-reference → Transforms](./spec-reference.md#transforms).

## Picking a chart type

| Goal | Use | Key channels |
| --- | --- | --- |
| Trend over time | `line` (`area` to emphasize volume) | `x` temporal, `y`, optional `series` |
| Part‑to‑whole over time | `area` + `stack: true` | `x`, `y`, `series` |
| Compare categories | `bar` | `x` category, `y`, optional `series` |
| Composition of a total | `bar` + `stack`, or `pie`/donut | bar: `series`; pie: `theta`, `color` |
| Correlation / distribution | `scatter` (+ `size` for a 3rd dim) | `x`, `y`, optional `size`, `series` |
| Distribution of one measure | `histogram` (auto-bins) | `x` quantitative (+ `bin`, `density?`) |
| Two measures / different units | `combo` (bar + line, dual-axis) | shared `x`; `layers[]` each with `mark` + `y` (+ `axis:'right'`) |
| Density across two categories | `heatmap` | `x`, `y`, `color` |
| Distribution / spread by group | `box` | `x` category, `y` observations, optional `series` |
| Flow between nodes / stages | `sankey` | `source`, `target`, `value` |
| Conversion through stages | `funnel` | `stage`, `value` |
| Values across a geography | `choropleth` | `geo`, `key`, `color` |
| Headline metric | `kpi` | `value`, `delta`, `sparkline` |
| Raw/detail records | `table` | `columns` (+ optional totals, groups, bars/icons/rules) |
| Aggregated cross‑tab | `matrix` | `rows`, `columns`, `values` (+ `showAs` percentages) |
| Slice/filter a field | `dropdown` · `list` · `search` · `range` · `dateRange` | `field` (+ `param?`) |
| Cross‑filtered page | `dashboard` | `views`, `interactions` |

Rules of thumb: prefer `bar` over `pie` beyond ~6 slices; use `stack` for
part‑to‑whole and grouped bars for direct comparison; reserve `pie` for a small
number of shares. For a donut with several small slices, set `labels` to a
`PieLabels` object — `placement:'auto'` keeps tight labels readable by moving
them outside onto leader lines.

## Recipes

**Multi‑series line**

```jsonc
{
  "type": "line",
  "data": [/* { date, value, region } rows */],
  "encoding": {
    "x": { "field": "date", "type": "temporal" },
    "y": { "field": "value" },
    "series": { "field": "region" }
  },
  "curve": "monotone"
}
```

**Reference line + threshold zone** — call out a target or safe range with `annotations`
(works on `line`, `area`, `bar`, `scatter`, `box`):

```jsonc
{
  "type": "line",
  "data": [/* { month, latency } rows */],
  "encoding": {
    "x": { "field": "month", "type": "temporal" },
    "y": { "field": "latency" }
  },
  "annotations": [
    { "value": 200, "label": "SLA", "color": "#ef4444" },   // horizontal rule on y
    { "type": "zone", "from": 0, "to": 100, "label": "Healthy" }, // shaded band
    { "axis": "x", "value": "2024-06", "label": "Launch" }  // vertical rule on x
  ]
}
```

A bare `value` infers a `line`; `from`/`to` infers a `band` (`zone` is an alias). Default
`axis` is `y`. Full field list: [spec-reference → Annotations](./spec-reference.md#annotations-reference-lines-bands-zones).

**Combo / dual-axis (bar + line)** — two measures with different units over a shared x.
Each layer plots its own `y`; add `axis:"right"` for a secondary scale:

```jsonc
{
  "type": "combo",
  "data": [/* { month, revenue, conversion } rows */],
  "encoding": { "x": { "field": "month" } },     // shared category/time axis
  "layers": [
    { "mark": "bar",  "encoding": { "y": { "field": "revenue" } } },               // left axis
    { "mark": "line", "axis": "right", "points": true,
      "encoding": { "y": { "field": "conversion", "format": ".1%" } } }            // right axis
  ]
}
```

Bars force a categorical x; multiple `bar` layers group side-by-side. Reserve the `right`
axis for genuinely different units — a secondary axis can imply a correlation that isn't
there (the linter warns with `combo-dual-axis`).

**Histogram (distribution)** — pass raw observations; the chart bins them for you:

```jsonc
{
  "type": "histogram",
  "data": [/* { latency } rows — one per observation */],
  "encoding": { "x": { "field": "latency", "title": "Latency (ms)" } },
  "bin": { "maxbins": 20 },   // or { "step": 25 } for fixed-width bins
  "density": false             // true ⇒ probability density (area sums to 1)
}
```

Don't pre-bin or pre-count — feed one row per observation and let `bin` do the work.
`x` must be quantitative (the linter warns otherwise).

**KPI with delta + sparkline**

```jsonc
{
  "type": "kpi",
  "label": "Total sales",
  "value": { "field": "sales", "aggregate": "sum" },
  "delta": 0.124,           // +12.4%, drives the up indicator
  "format": "$,.0f",
  "sparkline": true,
  "data": [/* rows with a `sales` column */]
}
```

**Table with conditional formatting**

```jsonc
{
  "type": "table",
  "data": [/* order rows */],
  "columns": [
    { "field": "order", "title": "Order" },
    { "field": "date", "title": "Date", "format": "%b %e, %Y" },
    { "field": "sales", "title": "Sales", "format": ",.0f", "prefix": "$", "align": "right",
      "group": "Revenue", "conditionalFormat": { "type": "bar", "showValue": true } },
    { "field": "margin", "title": "Margin", "format": ".1%", "align": "right",
      "group": "Revenue", "conditionalFormat": { "type": "icon", "set": "trafficLights" } }
  ],
  "totals": { "label": "Total" },
  "sort": { "field": "sales", "order": "desc" }
}
```

**Pivot/matrix with subtotals**

```jsonc
{
  "type": "matrix",
  "data": [/* { region, segment, category, sales } rows */],
  "rows": ["region", "segment"],
  "columns": ["category"],
  "values": [{ "field": "sales", "op": "sum", "format": "$,.0f" },
             { "field": "sales", "op": "sum", "label": "% total", "showAs": "percentOfTotal" }],
  "subtotals": true,
  "grandTotals": true
}
```

**Box plot from raw observations**

```jsonc
{
  "type": "box",
  "data": [/* many { group, value } rows — one per observation */],
  "encoding": {
    "x": { "field": "group" },
    "y": { "field": "value", "title": "Latency (ms)" }
  },
  "whisker": "tukey"          // 1.5×IQR whiskers + outliers (default)
}
```

**Sankey from link rows**

```jsonc
{
  "type": "sankey",
  "data": [
    { "source": "Coal", "target": "Electricity", "value": 120 },
    { "source": "Electricity", "target": "Residential", "value": 170 }
    /* …one row per link; nodes are derived automatically */
  ],
  "encoding": {
    "source": { "field": "source" },
    "target": { "field": "target" },
    "value": { "field": "value", "title": "TWh" }
  }
}
```

**Choropleth (data + GeoJSON)**

```jsonc
{
  "type": "choropleth",
  "geo": { "type": "FeatureCollection", "features": [/* Polygon/MultiPolygon */] },
  "data": [/* { state, value } rows */],
  "encoding": {
    "key": { "field": "state" },         // joins to a feature
    "color": { "field": "value", "title": "Index" }
  },
  "featureId": "name",                    // read feature.properties.name
  "scheme": "teal"
}
```

Copy‑paste starting points for **every** type live in [`docs/examples/`](./examples).

## Interactivity (selection, highlight, filter)

Visuals can react to one another. The unit of interactivity is a **selection** — a
named, JSON‑serializable value a visual *publishes* (clicking a mark, brushing, or
changing a slicer) that others *consume* as either a **highlight** (emphasize the
matches, dim the rest) or a **filter** (subset the rows). Selections are plain data, so
specs still round‑trip through `JSON.stringify`. Three optional fields on any spec:

```jsonc
{
  // publish: clicking a bar writes a "point" selection to the param `pick`
  "params": [{ "name": "pick", "select": { "type": "point", "fields": ["region"] } }],
  // consume (emphasize): dim rows that don't match another visual's param
  "highlight": { "param": "pick" },
  // consume (subset): keep only rows matching every clause (param or literal)
  "filter": [{ "param": "region" }, { "field": "sales", "range": [100, 500] }]
}
```

- `params[].select.type` is `point` (discrete picks; toggles/multi‑selects) or
  `interval` (a continuous range). `fields` defaults to the chart's key channel.
- `highlight` references a param by name; pass an array to union several sources.
- `filter` clauses are a `{ param }` (cross‑filter) or a literal predicate:
  `{ field, equals }`, `{ field, oneOf }`, `{ field, range:[min,max] }`,
  `{ field, contains }`. An empty/absent selection matches everything (`empty:'all'`).

**Slicers** are first‑class visuals that publish a selection from a control:

| Slicer | Emits | Notable fields |
| --- | --- | --- |
| `dropdown` | set (or single) | `multiple`, `placeholder` |
| `list` | set (checkboxes) | `selectAll`, `searchThreshold` |
| `search` | text (contains) | `placeholder`, `debounce` |
| `range` | numeric range | `min`, `max`, `step`, `format` |
| `dateRange` | temporal range | `presets`, `format` |

Each reads one `field` and writes to `param` (default = the field name), so a slicer
auto‑connects to any visual that filters/highlights on that param name. Options and
bounds derive from the *unfiltered* data, so a slicer never hides its own choices.

```jsonc
{ "type": "dropdown", "field": "region", "multiple": true, "title": "Region" }
```

## Building dashboards

A `dashboard` spec composes charts and slicers into one cross‑interacting page — a
single JSON object, validated by `validateSpec`, rendered with `renderDashboard`.

```ts
import { renderDashboard, validateSpec } from 'graphein';

const dash = {
  type: 'dashboard',
  data: rows,                       // shared dataset; views inherit it
  layout: {
    cols: 12,
    density: 'comfortable',
    sections: [
      { title: 'Overview', views: ['region', 'total'] },
      { title: 'Sales detail', views: ['byRegion', 'trend'] },
    ],
  },
  views: [
    { id: 'region', title: 'Region filter', spec: { type: 'dropdown', field: 'region', multiple: true }, w: 3, h: 2 },
    { id: 'total', title: 'Total sales', accent: '#14b8a6',
      spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } }, w: 3, h: 2 },
    { id: 'byRegion', spec: { type: 'bar', data: salesByRegionProduct,
        encoding: { x: { field: 'region' }, y: { field: 'sales' }, series: { field: 'product' } }, stack: true }, w: 9, h: 3 },
    { id: 'trend',  spec: { type: 'line',
        encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'sales' }, series: { field: 'region' } } }, w: 9, h: 3 },
  ],
  interactions: 'auto',
};

validateSpec(dash);
const d = renderDashboard('#app', dash);
// d.getSelection(name?) · d.setSelection(name, value) · d.clearSelection(name?)
// d.on('selectionchange', (name, value) => …) · d.update(next) · d.resize() · d.destroy()
```

**Auto‑wiring** (`interactions:'auto'`, the default) follows Power BI semantics:

- **Slicers filter the whole page** — every non‑slicer view whose **data contains the
  field** is subset by the slicer (a KPI total, a table, a chart). A view that inherits
  the dashboard's `data` carries every column, so it responds. A view with its own
  pre‑aggregated `data` only responds to the dimensions it actually carries — a filter on
  a column that view's data lacks is **ignored for that view** (it is *not* blanked). So
  if you want a pre‑aggregated chart to react to a slicer, include that field in its
  rows (e.g. aggregate by `region × product`, not `region` alone).
- **Chart clicks cross‑highlight** — clicking a mark emphasizes the matching subset in
  views that encode the same field (and always self‑highlights). Highlight is per‑mark,
  so it only applies where the field is plotted.

Opt out with `interactions:'none'`, or replace auto‑wiring with explicit links:

```jsonc
"interactions": [
  { "source": "region", "target": "*", "as": "filter" },
  { "source": "byRegion", "target": ["trend"], "as": "highlight", "fields": ["region"] }
]
```

Layout is a responsive 12‑column grid; give a view `x`/`y`/`w`/`h` to place it, or omit
them to auto‑flow. Use `layout.sections` to create stacked BI bands (unlisted views land
in an implicit trailing section), `layout.preset:'kpi-first'|'sidebar'` for good default
placement, and page chrome like `maxWidth`, `density`, and `padding`. Each view can add
dashboard card chrome (`title`, `subtitle`, `accent`, `background`, `frame:false`,
`padding:'none'`) and per-view `responsive:[{maxWidth,w,h,hidden}]` spans. The grid still
reflows at `layout.breakpoints`, and compact slicers gather into a **navigator strip**
unless `layout.navigators:'inline'`. Theme cascades to every view.

> **Prefer the `dashboard` spec** for cross‑interaction. You can still hand‑place
> independent `render()` calls in your own grid for a static dashboard — share one
> `theme`, give each container a size (charts track resizes via `ResizeObserver`), and
> pass a shared `store` (`createSelectionStore()`) to `render(el, spec, { store })` if
> you want them to cross‑interact manually.

## Formatting & dates

- Numbers: use a [format hint](./spec-reference.md#format-mini-language) like `$,.0f`,
  `.1%`, `,d`, `.1s`.
- Dates: JSON has no `Date`, so pass **ISO strings** (`"2024-01-15"`) or epoch ms.
  Mark the field `"type": "temporal"` for time axes. A `%` format (e.g. `%b %Y`)
  renders date strings in tables/labels.

## Theming

```jsonc
"theme": "dark"
// or derive an accent from a brand color:
"theme": { "base": "light", "color": { "accent": "#7c3aed" } }
```

The default look is **flat and modern** (solid fills, minimal shadows). The built‑in
palette is accessible on both light and dark backgrounds.

## Hand-drawn ("sketch") mode

Add `"sketch": true` to **any** spec to render it as a rough.js‑style hand‑drawn
sketch — wobbly outlines, hachure fills, and a handwriting font. It works for every
chart type and composes with everything else (themes, legends, animation, dashboards).

```jsonc
{ "type": "bar", "data": [/* … */], "encoding": { "x": { "field": "q" }, "y": { "field": "v" } }, "sketch": true }
```

Pass an object to tune it: `fillStyle` (`hachure` | `solid` | `cross-hatch`),
`roughness`, `bowing`, `hachureGap`/`hachureAngle`, `strokeWidth`, `font`, and an
optional `seed`. Reach for it for a casual, low‑fidelity, "napkin sketch" feel
(brainstorms, draft dashboards, playful reports); keep it off for precise/formal
charts. The output is deterministic, so the same spec always looks identical.

## Validation & gotchas

- **`encoding` is required** for `line`/`area`/`bar`/`scatter`/`box` (`x`+`y`), `pie`
  (`theta`+`color`), `heatmap` (`x`+`y`+`color`), `sankey` (`source`+`target`+`value`),
  and `choropleth` (`key`+`color`, plus a `geo` FeatureCollection). `kpi`/`table`/`matrix`
  use their own field lists instead of `encoding`.
- **Field names must exist** in every `data` row (dotted paths like `a.b` read nested
  values).
- **Don't pre‑pivot** for charts — pass tidy rows and split with `series`. Use `matrix`
  when you actually want an aggregated cross‑tab.
- **Aggregation:** `kpi.value` and `matrix.values[].op` aggregate for you. Cartesian
  charts (`bar`/`line`/…) plot rows **as‑is** — `FieldDef.aggregate` is ignored there,
  so pre‑aggregate to one row per mark (or split with `series`, or use `matrix`).
- **Tables/matrices:** conditional-format icons are Unicode glyphs (no icon fonts).
  Matrix `showAs` percentages compute denominators from leaf cells even when
  subtotals/grand totals are not shown.
- Everything is plain JSON: no functions, no DOM nodes, no `Date` objects inside a spec.
- **Read the `warnings`.** Beyond structural `errors`, `validateSpec` runs a **dataviz
  linter** (also `lintSpec(spec)`) that flags best‑practice issues — too many pie
  slices, a date field typed `nominal`, a truncated bar baseline, a log axis over
  non‑positive data, too many series, a high‑cardinality axis. Each finding has a
  stable `rule` id and a `severity`; they never block rendering but usually point at a
  better chart.
- **Let the spec repair itself.** When a mistake has an unambiguous fix (a typo'd
  chart `type` or aggregate `op`, a temporal field typed `nominal`), the
  `ValidationError` carries a `fix` (JSON Patch ops) and/or a `suggestion`
  (`{ kind, candidates }` "did you mean"). Call `repairSpec(spec)` to apply every
  safe fix and re-validate in one shot — it returns `{ spec, applied, remaining }`,
  where `remaining` is empty once the spec is valid. Prefer this over regenerating
  from scratch; only the truly ambiguous problems are left for you to resolve.

## Verify the render (the critique loop)

Validation catches structural and best-practice problems **before** drawing. After
drawing, ask the chart whether it actually came out right — without needing to look
at it:

```ts
const chart = render('#chart', spec);
const report = chart.report();
if (!report.ok) {
  for (const d of report.diagnostics) {
    // d.code, d.severity, d.message — e.g. 'axis-label-overlap', 'legend-overflow',
    // 'low-contrast-mark', 'marks-clipped', 'degenerate-axis'
  }
}
```

`report()` returns counts (`markCount`, `seriesCount`, `colorCount`) plus
`diagnostics` — clipped axis labels, a truncated legend, near-invisible colors, a
flat/degenerate axis, marks falling outside the plot. It's computed from the
resolved model (no pixels read), so it works the same in the browser and headless.
The full loop is **generate → `validateSpec` → `repairSpec` → render → `report()`**:
if the report isn't `ok`, adjust the spec (widen the chart, move the legend, reduce
categories) and re-render. See [Render report](./spec-reference.md#render-report)
for every diagnostic code.

### Running the loop server-side (no browser)

The whole critique loop runs in Node with [`@graphein/node`](https://www.npmjs.com/package/@graphein/node)
— no browser, no JSDOM. It renders a spec to a PNG **and** returns the same report,
so an agent can generate, validate, render, and critique a chart entirely on the
server (CI, report emails, PDF assets):

```ts
import { renderChart } from '@graphein/node';
const { png, report } = renderChart(spec, { width: 900, height: 480, dpr: 2 });
if (!report.ok) {
  // adjust the spec from report.diagnostics and re-render — same codes as the browser
}
await fs.writeFile('chart.png', png);
```

It supports every canvas-backed chart (line, area, bar, scatter, box, pie, heatmap,
sankey, choropleth, combo, histogram, funnel). DOM-only visuals (kpi/table/matrix/
slicers/dashboard) throw. Core's dependency-free `renderToContext(target, spec)` paints
onto any 2D context if you bring your own canvas (`OffscreenCanvas`, `node-canvas`, …).

## Lifecycle

```ts
const chart = render('#chart', spec);
chart.update(nextSpec);   // new data/config, same container
chart.resize();           // re-measure after a layout change
chart.destroy();          // remove on teardown (SPA route change, etc.)
```

See the full field‑by‑field [Spec Reference](./spec-reference.md) and the
machine‑readable [JSON Schema](./chart-spec.schema.json).
