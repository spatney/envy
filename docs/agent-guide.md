# Envy Agent Guide

A practical playbook for **coding agents** that generate Envy charts and dashboards.
Envy is built for you: one chart = one JSON‑serializable [`ChartSpec`](./spec-reference.md),
no callbacks, sensible defaults, and good visuals at any size.

## The one rule

> Emit a single JSON object with a `type`, a `data` array of flat records, and
> (for cartesian charts) an `encoding` that names the columns.

```ts
import { render } from '@envy/core';
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

Envy expects **long/tidy** data: one row per observation, one column per variable.
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

## Picking a chart type

| Goal | Use | Key channels |
| --- | --- | --- |
| Trend over time | `line` (`area` to emphasize volume) | `x` temporal, `y`, optional `series` |
| Part‑to‑whole over time | `area` + `stack: true` | `x`, `y`, `series` |
| Compare categories | `bar` | `x` category, `y`, optional `series` |
| Composition of a total | `bar` + `stack`, or `pie`/donut | bar: `series`; pie: `theta`, `color` |
| Correlation / distribution | `scatter` (+ `size` for a 3rd dim) | `x`, `y`, optional `size`, `series` |
| Density across two categories | `heatmap` | `x`, `y`, `color` |
| Distribution / spread by group | `box` | `x` category, `y` observations, optional `series` |
| Flow between nodes / stages | `sankey` | `source`, `target`, `value` |
| Values across a geography | `choropleth` | `geo`, `key`, `color` |
| Headline metric | `kpi` | `value`, `delta`, `sparkline` |
| Raw/detail records | `table` | `columns` |
| Aggregated cross‑tab | `matrix` | `rows`, `columns`, `values` |

Rules of thumb: prefer `bar` over `pie` beyond ~6 slices; use `stack` for
part‑to‑whole and grouped bars for direct comparison; reserve `pie` for a small
number of shares.

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
    { "field": "sales", "title": "Sales", "format": "$,.0f", "align": "right",
      "conditionalFormat": { "type": "bar" } },
    { "field": "margin", "title": "Margin", "format": ".1%", "align": "right",
      "conditionalFormat": { "type": "colorScale" } }
  ],
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
  "values": [{ "field": "sales", "op": "sum", "format": "$,.0f" }],
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

## Building dashboards

Envy renders **one chart per container**. To compose a dashboard, lay out a grid
of elements and `render()` a spec into each — Envy charts are responsive by default
and fill their container.

```html
<div class="grid">
  <div id="kpi-sales"></div>
  <div id="trend"></div>
  <div id="by-region"></div>
  <div id="orders"></div>
</div>
```

```ts
render('#kpi-sales', kpiSpec);
render('#trend', lineSpec);
render('#by-region', barSpec);
render('#orders', tableSpec);
```

Tips:
- Give each container an explicit size (CSS grid/flex). Charts track resizes via
  `ResizeObserver`; you don't need to set `dimensions`.
- Share one `theme` across all specs for a cohesive look (e.g. all `'dark'`, or all
  with the same `accent`).
- Keep the data per chart minimal — pre‑filter to what each visual needs.

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
- **Aggregation:** `kpi.value`, `matrix.values[].op`, and `FieldDef.aggregate` do the
  summing/averaging — you generally don't pre‑aggregate.
- Everything is plain JSON: no functions, no DOM nodes, no `Date` objects inside a spec.

## Lifecycle

```ts
const chart = render('#chart', spec);
chart.update(nextSpec);   // new data/config, same container
chart.resize();           // re-measure after a layout change
chart.destroy();          // remove on teardown (SPA route change, etc.)
```

See the full field‑by‑field [Spec Reference](./spec-reference.md) and the
machine‑readable [JSON Schema](./chart-spec.schema.json).
