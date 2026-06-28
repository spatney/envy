# Graphein Spec Reference

Every Graphein chart is described by a single **`ChartSpec`** — a plain, JSON‑serializable
object. There are no functions, classes, or callbacks in a spec, so specs round‑trip
through `JSON.stringify` and are safe for a coding agent to emit, store, and replay.

```ts
import { render } from 'graphein';

const instance = render('#chart', {
  type: 'line',
  data: [{ month: '2024-01', users: 4200 }, { month: '2024-02', users: 4650 }],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'users', type: 'quantitative' },
  },
});
```

- **`type`** is the discriminator. One of:
  `line`, `area`, `bar`, `scatter`, `pie`, `heatmap`, `kpi`, `table`, `matrix`.
- **`data`** is a tidy/row‑oriented array of records (`Array<Record<string, unknown>>`).
  The same long‑format table feeds every chart; you select fields via `encoding`
  (cartesian charts) or via explicit field lists (`table`, `matrix`).

Runnable JSON for every chart type lives in [`docs/examples/`](./examples).

---

## Table of contents

- [Common fields (`BaseSpec`)](#common-fields-basespec)
- [Encoding & `FieldDef`](#encoding--fielddef)
- [Scales](#scales)
- [Transforms](#transforms)
- [Annotations (reference lines, bands, zones, points)](#annotations-reference-lines-bands-zones-points)
- [Self-explaining charts (summaries & auto-insights)](#self-explaining-charts-summaries--auto-insights)
- [Chart types](#chart-types)
  - [line](#line) · [area](#area) · [bar](#bar) · [scatter](#scatter) · [combo](#combo) · [histogram](#histogram) · [pie](#pie)
  - [heatmap](#heatmap) · [kpi](#kpi) · [table](#table) · [matrix](#matrix)
  - [box](#box) · [funnel](#funnel) · [sankey](#sankey) · [choropleth](#choropleth)
  - [treemap](#treemap) · [gauge](#gauge) · [bullet](#bullet) · [calendarHeatmap](#calendarheatmap)
  - [waterfall](#waterfall) · [slope](#slope) · [dumbbell](#dumbbell)
- [Slicers](#slicers)
  - [dropdown](#dropdown) · [search](#search) · [list](#list) · [range](#range) · [dateRange](#daterange)
- [Interactivity (selection · highlight · filter)](#interactivity-selection--highlight--filter)
- [Dashboards](#dashboards)
- [Conditional formatting](#conditional-formatting)
- [Themes](#themes)
- [Sketch (hand-drawn) mode](#sketchconfig)
- [Format mini‑language](#format-mini-language)
- [Enumerations](#enumerations)
- [Runtime API](#runtime-api)
  - [Validation & linting](#validation--linting) · [Self-repairing specs](#self-repairing-specs) · [Render report](#render-report) · [Performance](#performance) · [Animation](#animation)
- [Accessibility](#accessibility)

---

## Common fields (`BaseSpec`)

Shared by **all** chart types.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `Datum[]` | — | Row‑oriented records. Required for every chart/table. |
| `transform` | `Transform[]` | — | Declarative pipeline that reshapes `data` **before** charting (aggregate, bin, filter, fold, timeUnit). See [Transforms](#transforms). |
| `theme` | `'light' \| 'dark' \| ThemeOverride` | `'light'` | Theme name or a partial override (see [Themes](#themes)). |
| `dimensions` | `{ width?, height?, autoResize? }` | responsive | Omit `width`/`height` to fill the container and track resizes. |
| `title` | `string \| TitleConfig` | — | `string`, or `{ text, subtitle?, align? }`. |
| `description` | `string` | auto | Accessible alt text. Used verbatim as the chart's `aria-label`; auto‑synthesized from type/title/data when omitted (see [Accessibility](#accessibility)). |
| `legend` | `LegendConfig \| boolean` | auto | `false` hides it; `{ show?, position?, title? }`. `position`: `top \| right \| bottom \| left`. |
| `tooltip` | `TooltipConfig \| boolean` | `true` | `false` (or `{ show: false }`) disables hover tooltips. |
| `axes` | `{ x?: AxisConfig, y?: AxisConfig }` | auto | Per‑axis overrides (cartesian charts). |
| `animation` | `AnimationConfig \| boolean` | on | Brief entrance on first render. `false` disables; `{ enabled?, duration?, easing? }`. Honors `prefers-reduced-motion` (see [Animation](#animation)). |
| `padding` | `Partial<Insets>` | auto | Extra `{ top, right, bottom, left }` px around the plot. |
| `background` | `string` | theme bg | CSS color override for the chart surface. |
| `sketch` | `boolean \| SketchConfig` | `false` | Render with the hand‑drawn ("sketch") look — wobbly outlines, hachure fills, and a handwriting font (see [`SketchConfig`](#sketchconfig)). |
| `params` | `SelectionParam[]` | — | Named selections this visual **publishes** (click/brush/slicer). See [Interactivity](#interactivity-selection--highlight--filter). |
| `highlight` | `HighlightConfig \| HighlightConfig[]` | — | Emphasize rows matching a param; dim the rest. An array unions sources. |
| `filter` | `FilterClause[]` | — | Subset rows to those matching **every** clause (a `{ param }` or a literal predicate). |

### `TitleConfig`

```jsonc
{ "text": "Monthly active users", "subtitle": "Trailing 6 months", "align": "left" }
```

### `AxisConfig`

| Field | Type | Notes |
| --- | --- | --- |
| `show` | `boolean` | Hide the whole axis with `false`. |
| `title` | `string` | Axis title (overrides the field title). |
| `grid` | `boolean` | Toggle gridlines for this axis. |
| `ticks` | `number` | Approximate tick count (a hint, not exact). |
| `tickValues` | `number[]` | Explicit tick positions. |
| `format` | `string` | [Format hint](#format-mini-language) for tick labels. |
| `labels` | `boolean` | Show/hide tick labels. |

### `SketchConfig`

Turns on the alternate **hand‑drawn renderer** — a from‑scratch, rough.js‑style
engine baked into `graphein` (no extra dependency). Marks get wobbly multi‑pass
outlines and hachure fills; text switches to a bundled handwriting font (Patrick
Hand, SIL OFL). Works for **every** chart type, including the DOM charts
(`kpi`/`table`/`matrix`, which get the font plus subtle hand‑drawn chrome).

Set `sketch: true` for all defaults, or pass an object to tune the look:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `roughness` | `number` | `1` | Jitter amount. `0` ≈ clean; higher is wilder. |
| `bowing` | `number` | `1` | How much straight strokes bow/curve. |
| `fillStyle` | `'hachure' \| 'solid' \| 'cross-hatch'` | `'hachure'` | Shape fill style. |
| `hachureGap` | `number` | auto | Px between hachure lines (scales with stroke when omitted). |
| `hachureAngle` | `number` | `-41` | Hachure line angle, in degrees. |
| `strokeWidth` | `number` | `1` | Outline width multiplier. |
| `seed` | `number` | derived | Explicit PRNG seed. Omit for a stable seed derived from the spec (renders identically every time). |
| `font` | `boolean` | `true` | Apply the handwriting font. Set `false` to keep the theme font. |

```jsonc
// All defaults
{ "type": "bar", "data": [/* … */], "sketch": true }

// Tuned: bolder cross-hatch fill
{ "type": "pie", "data": [/* … */], "sketch": { "fillStyle": "cross-hatch", "roughness": 1.6 } }
```

Rendering is **deterministic**: a given spec always produces the same drawing, so
sketch charts are safe to snapshot/screenshot‑test. Turning sketch off restores the
default crisp rendering path exactly (zero cost when unused — the font and engine are
code‑split and only loaded on the sketch path).

---

## Encoding & `FieldDef`

Cartesian charts (`line`, `area`, `bar`, `scatter`) and `pie`/`heatmap` map data
columns onto visual **channels** through `encoding`.

```jsonc
"encoding": {
  "x":      { "field": "month", "type": "temporal" },
  "y":      { "field": "users", "type": "quantitative", "format": ",d" },
  "series": { "field": "region" }
}
```

### Channels (`Encoding`)

| Channel | Used by | Purpose |
| --- | --- | --- |
| `x` | line, area, bar, scatter, heatmap | Horizontal position. |
| `y` | line, area, bar, scatter, heatmap | Vertical position. |
| `y2` | area | Upper bound for ranged/band marks. |
| `color` | heatmap, pie, choropleth | Continuous color (heatmap/choropleth) or slice color (pie). |
| `size` | scatter | Bubble radius. |
| `series` | line, area, bar, box | Splits data into multiple series (multi‑line, grouped/stacked bars, stacked areas, grouped boxes). |
| `theta` | pie | Angular measure (the slice value). |
| `source` | sankey | Link source node (one row per link). |
| `target` | sankey | Link target node. |
| `value` | sankey | Flow magnitude (ribbon/node thickness). |
| `key` | choropleth | Joins a data row to a map feature. |
| `label` | any | Text/label channel. |

### `FieldDef`

| Field | Type | Notes |
| --- | --- | --- |
| `field` | `string` | **Required.** Column name. Dotted paths (`a.b`) read nested values. |
| `type` | `FieldType` | `quantitative \| temporal \| ordinal \| nominal`. Inferred from the data when omitted. |
| `aggregate` | `AggOp` | Aggregation when grouping (e.g. `sum` of `sales`). See [enums](#enumerations). |
| `title` | `string` | Axis/legend title override. |
| `format` | `string` | [Format hint](#format-mini-language) for labels/tooltips. |
| `scale` | `ScaleConfig` | Per‑channel scale overrides (see below). |

> **Temporal fields:** JSON has no `Date` type, so pass dates as ISO‑ish strings
> (`"2024-01-15"`, `"2024-01"`) or epoch milliseconds. Graphein parses them for time
> axes, and `%` date formats coerce date strings for display in tables.

---

## Scales

`FieldDef.scale` tunes how a channel maps data → pixels/color.

| Field | Type | Applies to | Notes |
| --- | --- | --- | --- |
| `type` | `'linear' \| 'log' \| 'time' \| 'band' \| 'point'` | x/y | Override the inferred scale type. |
| `domain` | `[number, number] \| string[]` | x/y/color | Explicit domain; numbers for continuous, strings for categorical. |
| `nice` | `boolean` | continuous | Round the domain to nice tick values. |
| `zero` | `boolean` | continuous | Force the domain to include 0. |
| `clamp` | `boolean` | continuous | Clamp out‑of‑domain values into range. |
| `padding` | `number` (0..1) | band/point | Inter‑category padding. |
| `base` | `number` | log | Log base. |
| `reverse` | `boolean` | any | Reverse the output range. |

---

## Transforms

`transform` is an ordered pipeline that reshapes the `data` array **inside the
spec**, before the chart model is built. It exists to kill the most common agent
mistake — *mis‑shaping the data array before charting*. Instead of pre‑aggregating
or pivoting rows in code, point a chart at raw rows and let a validatable transform
do the shaping. Encodings may reference columns the pipeline produces.

```json
{
  "type": "bar",
  "data": [ { "region": "West", "sales": 10 }, { "region": "West", "sales": 5 }, { "region": "East", "sales": 8 } ],
  "transform": [
    { "filter": { "field": "sales", "gt": 0 } },
    { "aggregate": [ { "op": "sum", "field": "sales", "as": "sales" } ], "groupby": ["region"] }
  ],
  "encoding": { "x": { "field": "region" }, "y": { "field": "sales" } }
}
```

Steps run in array order. Each step carries **exactly one** operator key. The
pipeline is pure (it never mutates `data`) and is also exported standalone as
`applyTransforms(transforms, data)`. It runs **before** any selection cross‑filter.

| Operator | Shape | Notes |
| --- | --- | --- |
| `aggregate` | `{ aggregate: AggregateOp[], groupby?: string[] }` | Group rows and summarize. Omit `groupby` to collapse to one row. |
| `bin` | `{ bin: string, as: string \| [string,string], maxbins?, step?, extent?, nice? }` | Bucket a numeric field. `as` as a `[start,end]` pair captures both edges (drives the histogram). |
| `filter` | `{ filter: FilterPredicate }` | Keep rows matching a JSON predicate. |
| `fold` | `{ fold: string[], as?: [string,string] }` | Wide → long: gather columns into key/value rows (`as` defaults to `['key','value']`). |
| `timeUnit` | `{ timeUnit: TimeUnit, field: string, as: string }` | Truncate a timestamp to a calendar unit start (writes a `Date`). |
| `calculate` | `{ calculate: string, as: string }` | Derive a column from a safe expression (see [`calculate`](#calculate-expressions)). |

### `AggregateOp`

| Field | Type | Notes |
| --- | --- | --- |
| `op` | `AggOp` | `sum \| mean \| avg \| min \| max \| count \| countDistinct \| median \| first \| last`. |
| `field` | `string` | Source column. Omit only for `count`. |
| `as` | `string` | Output column. |

### `FilterPredicate`

A leaf predicate tests one `field`; `and` / `or` / `not` compose them. Comparisons
coerce numerically (numbers first, then dates), so temporal bounds work as ISO
strings.

- Leaf on a `field`: one of `equals`, `ne`, `oneOf`, `range: [lo,hi]`, `contains`,
  `gt`, `gte`, `lt`, `lte`, or `valid: boolean` (drops null/NaN when `true`).
- Composite: `{ and: [...] }`, `{ or: [...] }`, `{ not: {...} }`.

```json
{ "filter": { "and": [
  { "field": "year", "gte": 2020 },
  { "field": "region", "oneOf": ["West", "East"] }
] } }
```

### `TimeUnit`

`year · quarter · month · week · day · hour · minute · second`. Truncates to the
start of the unit so rows aggregate by period without manual date math:

```json
{ "timeUnit": "month", "field": "date", "as": "month" }
```

### `calculate` expressions

`{ "calculate": "<expr>", "as": "col" }` derives a column by evaluating `<expr>`
for each row. Bare identifiers reference columns; use `datum['my field']` for
names with spaces. The expression is parsed to an AST and evaluated with **no
`eval`/`Function`** and no access to globals — it is pure and deterministic.

```json
{ "calculate": "round(revenue / users, 2)", "as": "arpu" }
```

Supported:

- **Operators:** `+ - * / %`, comparisons `< <= > >= == != === !==`, logical
  `&& || !`, ternary `cond ? a : b`. `+` concatenates if either side is a string,
  else adds numerically; comparisons coerce to numbers when both sides are numeric.
- **Literals:** numbers, `'single'`/`"double"` quoted strings, `true`, `false`, `null`.
- **Member access:** `datum.field` and `datum['field']` (prototype keys are blocked).
- **Functions:** `abs round floor ceil trunc sign sqrt exp log log10 log2 pow min
  max number isFinite isNaN str lower upper trim length substring replace contains
  startsWith endsWith concat coalesce if year month day hours minutes`. No
  `now()`/`random()` — transforms stay deterministic.

> **Note:** `FieldDef.aggregate` (on `kpi`/`matrix`) still aggregates at encode
> time. For cartesian charts, prefer a `transform` `aggregate` step so there is one
> row per mark.

---

## Annotations (reference lines, bands, zones, points)

Cartesian charts (`line`, `area`, `bar`, `scatter`, `box`) accept an optional
`annotations: Annotation[]` — reference lines, shaded bands, threshold zones, and labeled
points drawn over the plot. They're declarative data (no callbacks) and ship as overlay
marks plus an HTML label layer, so an agent can call out a target, SLA, safe range, or a
specific data point in one field.

```ts
{
  type: 'line',
  data: rows,
  encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'latency' } },
  annotations: [
    { value: 200, label: 'SLA', color: '#ef4444' },            // horizontal rule on y
    { type: 'zone', from: 0, to: 100, label: 'Healthy' },      // shaded threshold band
    { axis: 'x', value: '2024-06', label: 'Launch' },          // vertical rule on x
    { type: 'point', x: '2024-04', y: 210, label: 'Spike' },   // labeled marker dot
  ],
}
```

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | `'line' \| 'band' \| 'zone' \| 'point'` | inferred | Omit to infer: `line` when `value` is set, `band` when `from`/`to` are set. `zone` is a semantic alias for a threshold band; `point` marks a single `(x, y)` coordinate. |
| `axis` | `'x' \| 'y'` | `'y'` | `y` draws a horizontal line / full‑width band; `x` draws a vertical line / full‑height band. |
| `value` | `number \| string \| Date` | — | Reference value for a `line` (matches the chosen axis). |
| `from`, `to` | `number \| string \| Date` | — | Span extents for a `band`/`zone`. |
| `x`, `y` | `number \| string \| Date` | — | Data coordinates for a `point` callout (matching the x/y axes). |
| `markerRadius` | `number` | `3.5` | Dot radius in pixels for a `point`. |
| `label` | `string` | — | Short text drawn beside the annotation. |
| `color` | `string` | muted theme color | Stroke (line) / fill (band) / dot (point) color. |
| `strokeWidth` | `number` | `1.5` | Line width in pixels. |
| `strokeDash` | `number[]` | dashed | Dash pattern; `[]` is solid. |
| `fillOpacity` | `number` | `0.12` | Band/zone fill opacity (0..1). |
| `labelPosition` | `'start' \| 'middle' \| 'end'` | `'end'` | Where the label anchors along a line/band. |

Validation rules: a `line` needs `value`; a `band`/`zone` needs both `from` and `to`;
`value` and `from`/`to` are mutually exclusive; values must be scalars (number, string,
or date). Annotations on a non‑cartesian chart produce a warning (they're ignored).

---

## Self-explaining charts (summaries & auto-insights)

Graphein derives the analytical labeling and prose an agent would otherwise have to reason
out — deterministically, with no LLM. Two surfaces share one pure analysis core
([`analyze/`](../packages/core/src/analyze)):

**`summarize(spec): string`** — a one-line natural-language summary of what the numbers say
(trend + net change, the largest/smallest category and its share, scatter correlation, a
value vs. its target). It doubles as alt-text and is attached to every render report:

```ts
import { summarize, render } from 'graphein';

summarize(spec);              // "Users rose 46% from 4,200 to 6,150 between 2024-01 and 2024-06, peaking at 6,400 in 2024-03."
render('#app', spec).report().summary;   // same string, on the RenderReport
```

The summary also feeds the chart's `aria-description` automatically (unless you set an
explicit `description`), so the chart explains itself to screen readers.

**`insights: boolean | InsightOptions`** — opt a cartesian chart (`line`, `area`, `bar`)
into automatic on-chart callouts. The library finds the notable points and draws labeled
`point` annotations, so an agent never hardcodes where the peak is:

```ts
{ type: 'line', data: rows, encoding: { /* … */ }, insights: true }       // marks max ▲ + min ▼
{ type: 'bar',  data: rows, encoding: { /* … */ }, insights: { outliers: true } }
```

| `InsightOptions` | Type | Default | Notes |
| --- | --- | --- | --- |
| `max` | `boolean` | `true` | Mark the maximum point (or top category for a `bar`). |
| `min` | `boolean` | `true` | Mark the minimum point (or bottom category). |
| `outliers` | `boolean` | `false` | Mark points beyond the 1.5×IQR Tukey fences. |

`insights: true` is shorthand for `{ max: true, min: true }`. Multi-series charts are
skipped (markers on every series would clutter the plot) — use `insights` on a single
series. Auto-insight annotations merge with any explicit `annotations` you provide.

---

## Chart types

### line

Time/continuous series with optional multi‑series, markers, and area fill.
Large series are automatically [decimated (LTTB)](#performance) for fast redraws.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x`, `y`; optional `series` | Multi‑series via `series`. |
| `curve` | `CurveType` | `linear \| monotone \| step \| stepBefore \| stepAfter \| catmullRom`. |
| `points` | `boolean` | Draw point markers. |
| `area` | `boolean` | Fill under the line. |

→ [`examples/line.json`](./examples/line.json)

### area

Filled series; stack multiple series into a band chart.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x`, `y`; optional `series` | — |
| `curve` | `CurveType` | Same options as `line`. |
| `stack` | `boolean` | Stack series (totals). Non‑stacked areas overlap with translucency. |

→ [`examples/area-stacked.json`](./examples/area-stacked.json)

### bar

Columns/bars with grouped or stacked series and rounded corners.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x`, `y`; optional `series` | — |
| `orientation` | `'vertical' \| 'horizontal'` | Default `vertical`. |
| `stack` | `boolean` | Stack series. |
| `group` | `boolean` | Side‑by‑side groups. Default when `series` is present and not stacked. |
| `cornerRadius` | `number` | Bar corner radius in px. |

→ [`examples/bar-grouped.json`](./examples/bar-grouped.json)

### scatter

Points/bubbles with optional size and color grouping. Hover focuses the nearest point.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x`, `y`; optional `size`, `series` | `size` drives bubble radius; `series` colors groups. |

→ [`examples/scatter.json`](./examples/scatter.json)

### combo

Dual-axis / layered cartesian chart — the canonical BI **bar + line**. Each entry in
`layers` is a mark (`bar`/`line`/`area`/`scatter`) plotting its own `y` measure over the
shared `encoding.x`. A layer can read against the primary (`left`) or a secondary
(`right`) y-axis, each with an independent scale. Multiple `bar` layers group side-by-side;
line/area/point layers align to category centres. The legend shows one entry per layer.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x` | The shared category/time axis. Bars force a categorical x. |
| `layers` | `ComboLayer[]` (≥1) | One mark + measure per layer (see below). |

**`ComboLayer`**

| Field | Type | Notes |
| --- | --- | --- |
| `mark` | `'line' \| 'bar' \| 'area' \| 'scatter'` | The mark drawn for this layer. |
| `encoding` | requires `y` | The measure (a `FieldDef`, with optional per-layer `format`) plotted on `y`. |
| `axis` | `'left' \| 'right'` | Which y-axis to measure against (default `left`). Add a `right` layer for dual-axis. |
| `curve` | `CurveType` | Interpolation for `line`/`area` layers. |
| `points` | `boolean` | Show point markers (line/area). |
| `area` | `boolean` | Fill under a `line` layer. |
| `cornerRadius` | `number` | Bar corner radius. |
| `name` | `string` | Legend label (defaults to the y field's title/name). |
| `color` | `string` | Override the layer colour (else the theme palette). |

> Dual-axis charts can imply correlations that aren't real — the linter emits an
> advisory `combo-dual-axis` (info) when both axes are used. Reserve a secondary axis for
> genuinely different units, and label both axes.

→ [`examples/combo-dual-axis.json`](./examples/combo-dual-axis.json)

### histogram

Distribution of a single quantitative field. Binning happens **inside** the chart
(reusing the `bin` transform), so you pass raw observations — no manual pre-binning. Bars
are gapless on a continuous x-axis; height is the per-bin count, or a probability density
when `density:true`.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x` | `x` is the quantitative field to bin (carries the axis title/format). |
| `bin` | `HistogramBin` | `{ maxbins?, step?, extent?, nice? }` — default ~10 nice bins. |
| `density` | `boolean` | Normalize heights to a probability density (area sums to 1). Default `false` (raw counts). |
| `color` | `string` | Bar colour (defaults to the first theme palette colour). |
| `cornerRadius` | `number` | Bar corner radius. |

**`HistogramBin`**

| Field | Type | Notes |
| --- | --- | --- |
| `maxbins` | `number` | Target bin count (approximate — a "nice" step is chosen). Default `10`. |
| `step` | `number` | Explicit bin width (overrides `maxbins`). |
| `extent` | `[number, number]` | Restrict binning to `[min, max]`; values outside are dropped. |
| `nice` | `boolean` | Snap bin edges to round numbers (default `true`). |

→ [`examples/histogram.json`](./examples/histogram.json)

### pie

Pie or donut with value/percent labels and slice‑lift hover.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `theta`, `color` | `theta` = value, `color` = slice category. |
| `donut` | `boolean \| number` | `true` for a default donut, or a `0..1` inner‑radius ratio. |
| `labels` | `boolean \| PieLabels` | `true`/`false` toggles labels; pass a `PieLabels` object for callout control (default `true` ⇒ auto). |

**`PieLabels`** — auto inside/outside callouts with leader lines:

| Field | Type | Notes |
| --- | --- | --- |
| `show` | `boolean` | Master toggle (default `true`). |
| `placement` | `'inside' \| 'outside' \| 'auto'` | `auto` (default) keeps a label inside when the text fits, otherwise an outside callout with a leader line. |
| `content` | `'percent' \| 'value' \| 'category' \| 'category-percent' \| 'category-value'` | What each label says (default: `percent` inside, `category-percent` for outside callouts). |
| `minShare` | `number` | Hide labels for slices below this share of the total, `0..1` (default `0.01`). |
| `connector` | `'slice' \| 'muted'` | Leader-line colour for outside callouts (default `slice`). |

→ [`examples/pie-donut.json`](./examples/pie-donut.json) · [`examples/donut-callouts.json`](./examples/donut-callouts.json)

### heatmap

Dense category × category grid colored by a measure.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x`, `y`, `color` | `x`/`y` are categories; `color` is the numeric measure. |
| `scheme` | `string` | Sequential ramp: `blues`, `teal`, `viridis`, `magma`, `greys`. |

→ [`examples/heatmap.json`](./examples/heatmap.json)

### kpi

A single stat card: big value, label, delta indicator, and inline sparkline.

| Field | Type | Notes |
| --- | --- | --- |
| `value` | `number \| { field, aggregate? }` | A literal, or a field aggregated over `data`. |
| `label` | `string` | Caption under/above the value. |
| `delta` | `number \| { field, aggregate? }` | Drives the up/down indicator (e.g. `0.124` → +12.4%). |
| `format` | `string` | [Format hint](#format-mini-language) for the value. |
| `sparkline` | `boolean \| { field }` | Inline trend from a numeric field. |

→ [`examples/kpi.json`](./examples/kpi.json)

### table

Virtualized, sortable data table with per‑column formatting, alignment, and
[conditional formatting](#conditional-formatting). Handles large row counts via
windowing.

| Field | Type | Notes |
| --- | --- | --- |
| `columns` | `TableColumn[]` | Explicit columns; inferred from `data` keys when omitted. |
| `sort` | `{ field, order? }` | `order`: `asc \| desc`. |
| `density` | `'comfortable' \| 'standard' \| 'compact'` | Row/header spacing preset. |
| `totals` | `boolean \| { label? }` | Adds a sticky footer row; measure columns default to `sum`. |
| `striped` | `boolean` | Zebra striping (off by default — flat aesthetic). |
| `stickyHeader` | `boolean` | Sticky header (default `true`). |

**`TableColumn`**

| Field | Type | Notes |
| --- | --- | --- |
| `field` | `string` | **Required.** Column key. |
| `title` | `string` | Header label (defaults to `field`). |
| `type` | `FieldType` | Affects default alignment/formatting. |
| `format` | `string` | [Format hint](#format-mini-language). |
| `align` | `'left' \| 'center' \| 'right'` | Cell/text alignment. |
| `width` | `number` | Fixed column width in px. |
| `conditionalFormat` | `ConditionalFormat` | In‑cell bar, color scale, icons, or rules. |
| `prefix` / `suffix` | `string` | Display text around formatted numeric values (for example `$`, `%`). |
| `negativeStyle` | `'sign' \| 'parens' \| 'red' \| 'parens-red'` | Negative number display. |
| `hidden` | `boolean` | Drops the column from rendering. |
| `sortable` | `boolean` | Set `false` to remove the sort button for that column. |
| `wrap` | `boolean` | Allows multi-line cell text. |
| `group` | `string` | Adds a top header band spanning consecutive columns with the same group. |
| `total` | `AggOp \| false` | Footer aggregation when `totals` is enabled. |

→ [`examples/table.json`](./examples/table.json)

### matrix

Pivot/cross‑tab: hierarchical row & column groups, aggregated measures, and
subtotals/grand totals — rendered through the table engine.

| Field | Type | Notes |
| --- | --- | --- |
| `rows` | `string[]` | **Required.** Row grouping fields (hierarchical, outer→inner). |
| `columns` | `string[]` | Column grouping fields (hierarchical). |
| `values` | `MatrixValueDef[]` | **Required.** Measures to aggregate. |
| `subtotals` | `boolean` | Group subtotals. |
| `grandTotals` | `boolean` | Overall totals row/column. |
| `density` | `'comfortable' \| 'standard' \| 'compact'` | Row/header spacing preset. |
| `columnSort` | `{ by:'value'\|'label', valueIndex?, order? }` | Sort leaf columns by label or aggregated measure. |

**`MatrixValueDef`**

| Field | Type | Notes |
| --- | --- | --- |
| `field` | `string` | **Required.** Measure column. |
| `op` | `AggOp` | **Required.** Aggregation (`sum`, `mean`, `count`, …). |
| `label` | `string` | Header label for the measure. |
| `format` | `string` | [Format hint](#format-mini-language). |
| `conditionalFormat` | `ConditionalFormat` | Per‑cell formatting. |
| `prefix` / `suffix` | `string` | Display text around formatted values. |
| `negativeStyle` | `TableColumn['negativeStyle']` | Negative number display. |
| `showAs` | `'value' \| 'percentOfRow' \| 'percentOfColumn' \| 'percentOfTotal'` | Display cell shares as percentages. Denominators are computed from leaf cells even when subtotals/grand totals are off. |

→ [`examples/matrix.json`](./examples/matrix.json)

### box

Box‑and‑whisker distributions: one box per category (and per `series`) showing
quartiles, median, whiskers, and outliers.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x`, `y`; optional `series` | `x` is the category; `y` holds the **raw observations** (many rows per category) — Graphein computes the quartiles. `series` draws grouped boxes side‑by‑side. |
| `whisker` | `'tukey' \| 'minMax'` | `tukey` (default): whiskers reach the furthest points within 1.5×IQR of the quartiles; points beyond are outliers. `minMax`: whiskers span the full range (no outliers). |
| `outliers` | `boolean` | Draw outlier points beyond the whiskers (tukey only; default `true`). |

→ [`examples/box.json`](./examples/box.json)

### funnel

Conversion funnel: tapering stages stacked top‑to‑bottom, each labeled with its value
and the share retained. Values are **aggregated by stage** (in first‑seen order), so you
can pass raw rows.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `stage`, `value` | `stage` = the step (ordered as first seen); `value` = the measure (**summed** per stage). |
| `labels` | `boolean` | Show stage name, value, and percent inside the funnel (default `true`). |
| `percent` | `'first' \| 'previous'` | Per‑stage percentage basis: `first` (default) = share retained vs. the top of the funnel; `previous` = step conversion vs. the stage above. |

→ [`examples/funnel.json`](./examples/funnel.json)

### sankey

Flow diagram: nodes linked by value‑weighted ribbons. Each data row is one
**link**; nodes are derived from the distinct `source`/`target` values and laid
out in layers by longest path, with ribbons colored by their source.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `source`, `target`, `value` | One row per link. `value` sets ribbon/node thickness. |
| `nodeWidth` | `number` | Node block width in px (default `16`). |
| `nodePadding` | `number` | Vertical gap between stacked nodes in px (default `14`). |
| `nodeValues` | `boolean` | Show each node's total beside its label (default `true`). |

→ [`examples/sankey.json`](./examples/sankey.json)

### choropleth

Thematic map: GeoJSON regions filled by a sequential color scale, with a value
legend and per‑region hover. Data rows join to features by a key.

| Field | Type | Notes |
| --- | --- | --- |
| `geo` | `GeoFeatureCollection` | **Required.** GeoJSON `FeatureCollection` of `Polygon`/`MultiPolygon` features. |
| `encoding` | requires `key`, `color` | `key` joins each row to a feature; `color` is the numeric value driving the fill. |
| `featureId` | `string` | Where to read a feature's join id: a property name (e.g. `'name'` → `feature.properties.name`), or `'id'` for the top‑level `feature.id`. Defaults to `feature.id` → `properties.id` → `properties.name`. |
| `projection` | `MapProjection` | `mercator` (default), `equirectangular`, or `identity` (coordinates are already planar `[x, y]`). |
| `scheme` | `string` | Sequential ramp: `blues`, `teal`, `viridis`, `magma`, `greys`. |

The map auto‑fits its container. Antimeridian‑crossing geometry (e.g. Alaska's
Aleutians) is handled by choosing a central meridian from the widest longitude
gap. For composite layouts like Alaska/Hawaii insets, pre‑project the geometry to
planar coordinates and use `projection: 'identity'`.

→ [`examples/choropleth.json`](./examples/choropleth.json)

### treemap

Part‑to‑whole as nested rectangles sized by a measure. A **squarified** layout keeps
tiles close to square so areas stay visually comparable; input order is preserved for
deterministic output. An optional `group` field nests leaves under one level of parent
tiles, each with a header label.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `category`, `value` | `category` labels/identifies each leaf tile; `value` is the numeric field sizing its area (summed per leaf). |
| `encoding.group` | `FieldDef` | Optional parent grouping → nested parent tiles (one level deep), each with a header label. |
| `encoding.color` | `FieldDef` | Optional field driving tile color — numeric ⇒ sequential `scheme`, otherwise the categorical palette. Without it, tiles color by group (else category). |
| `scheme` | `string` | Sequential ramp name when `color` is numeric (default `teal`). |
| `labels` | `boolean` | Show the value beneath each tile label (default `true`). |

→ [`examples/treemap.json`](./examples/treemap.json)

### gauge

A radial dial showing one value against a `[min, max]` scale, with an optional `target`
tick and qualitative background `bands`. Like [`kpi`](#kpi), the value is a literal
**or** a field (optionally aggregated over `data`). Renders to canvas (headless‑safe).

| Field | Type | Notes |
| --- | --- | --- |
| `value` | `ValueRef` | The measured value: a literal number, or `{ field, aggregate? }` summarized over `data`. |
| `max` | `number` | **Required.** Scale end (full‑scale). |
| `min` | `number` | Scale start (default `0`). |
| `target` | `ValueRef` | Optional threshold drawn as a needle/tick. |
| `bands` | `{ to: number, color? }[]` | Qualitative arc bands, each filling the scale up to `to`. |
| `label` | `string` | Caption under the value (defaults to the title or value field). |
| `format` | `string` | Number format for the value + scale ticks (e.g. `,.0f`, `.0%`). |

→ [`examples/gauge.json`](./examples/gauge.json)

### bullet

A compact linear KPI‑vs‑target: a measure bar over qualitative `ranges` (poor/ok/good
background bands) with a `target` comparative tick. Value and target are literals or
fields (optionally aggregated) — ideal as a dashboard tile. Renders to canvas
(headless‑safe).

| Field | Type | Notes |
| --- | --- | --- |
| `value` | `ValueRef` | The featured measure (literal or `{ field, aggregate? }`). |
| `target` | `ValueRef` | Comparative marker drawn as a vertical tick. |
| `ranges` | `number[]` | Qualitative range boundaries on the scale (e.g. `[600000, 800000, 1000000]`). |
| `min` / `max` | `number` | Scale bounds (`min` default `0`; `max` derived from value/target/ranges when omitted). |
| `label` | `string` | Caption to the left of the bar (defaults to the title or value field). |
| `format` | `string` | Number format for the value + axis ticks. |

→ [`examples/bullet.json`](./examples/bullet.json)

### calendarHeatmap

A GitHub‑contributions‑style grid: one cell per day colored by a value on a sequential
scale, with weekday rows and month labels. Pass tidy `{ date, value }` rows — dates may
be `Date` objects or ISO strings (both coerce for the `temporal` field).

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `date`, `color` | `date` → one cell per day; `color` is the numeric value driving the cell fill. |
| `scheme` | `string` | Sequential ramp name for the value scale (default `teal`). |

→ [`examples/calendar-heatmap.json`](./examples/calendar-heatmap.json)

### waterfall

A cash‑flow / bridge chart: floating bars walk a running total across ordered `stage`s,
where each `value` is a **signed delta** (positive rises, negative falls). Mark a stage in
`totals` (or append one with `showTotal`) to draw an absolute bar from the baseline — it
shows the running total but does **not** advance it. Dashed connectors join each step to
the next. Renders to canvas (headless‑safe).

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `stage`, `value` | `stage` → one bar per row (in data order); `value` is the **signed** change at that stage. |
| `totals` | `string[]` | Stage labels to draw as absolute running‑total bars from zero. |
| `showTotal` | `boolean` | Append a final bar summing every step (default `false`). |
| `totalLabel` | `string` | Label for the appended total bar (default `'Total'`). |
| `labels` | `boolean` | Show per‑bar value labels (default `true`). |
| `cornerRadius` | `number` | Bar corner radius in px (default `2`). |
| `increaseColor` / `decreaseColor` / `totalColor` | `string` | Override the up / down / total colors (default theme positive / negative / accent). |

→ [`examples/waterfall.json`](./examples/waterfall.json)

### slope

A slope graph — a minimal before/after chart: each `series` is a line joining its `y`
value across two (or a few) ordinal `x` positions, with **direct end labels** instead of a
legend, so change‑in‑rank and rise/fall read at a glance. Pass tidy `{ x, y, series }`
rows (one per series per x position). Renders to canvas (headless‑safe).

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `x`, `y`, `series` | `x` → the ordinal positions (typically two); `y` is the numeric value; `series` is one line each. |
| `colorByChange` | `boolean` | Color each line green/red by its net rise/fall instead of by series. |
| `labels` | `boolean` | Direct labels (series name + value) at each line's ends (default `true`). |
| `format` | `string` | Number format for the value labels and y‑axis. |

→ [`examples/slope.json`](./examples/slope.json)

### dumbbell

A dumbbell / connected‑dot plot: for each `category`, a dot per `group` placed on a shared
**horizontal** value axis and joined by a connector, so the gap between groups (before vs.
after, male vs. female) reads directly. Categories run down the y‑axis. Pass tidy
`{ category, value, group }` rows. Renders to canvas (headless‑safe).

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `category`, `value`, `group` | `category` → one band down the y‑axis; `value` → dot position on the x‑axis; `group` → one dot each (2+ levels), connected. |
| `sort` | `'ascending' \| 'descending' \| 'gap'` | Order the category rows (default: data order). `gap` sorts by dot spread. |
| `labels` | `boolean` | Value labels beside the dots (default `false`). |
| `format` | `string` | Number format for the value labels and x‑axis. |

→ [`examples/dumbbell.json`](./examples/dumbbell.json)

---

## Slicers

Interactive controls that **publish a selection** instead of plotting marks. A slicer
reads one `field` and writes to a `param` (defaulting to the field name), so it
auto‑connects to any visual that filters/highlights on that param. Options and bounds
derive from the **unfiltered** data, so a slicer never hides its own choices. Slicers
render standalone (they're ordinary DOM widgets) and slot into a [dashboard](#dashboards)
like any other view. They share the [common slicer fields](#common-slicer-fields) below
plus their own.

#### Common slicer fields

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `field` | `string` | **required** | Column the slicer reads options/bounds from and filters on. |
| `param` | `string` | `field` | Param name to publish to (the wire other visuals consume). |
| `label` | `string` | `title`/`field` | Label shown above the control. |
| `as` | `'filter' \| 'highlight'` | `'filter'` | How consumers react. |

Plus all [`BaseSpec`](#common-fields-basespec) chrome (`theme`, `title`, `sketch`, …).

### dropdown

Choose one (single) or several (multi) of a field's distinct values. Emits a `set`.

| Field | Type | Notes |
| --- | --- | --- |
| `multiple` | `boolean` | Allow multiple values. Default `false` (single‑select). |
| `placeholder` | `string` | Shown when nothing is selected. |

### search

A debounced, case‑insensitive substring filter over a text field. Emits a `text`
selection (`contains`).

| Field | Type | Notes |
| --- | --- | --- |
| `placeholder` | `string` | Input placeholder. |
| `debounce` | `number` | Ms before publishing the query (default `200`). |

### list

A scrollable checkbox list of a field's distinct values (multi‑select). Emits a `set`.

| Field | Type | Notes |
| --- | --- | --- |
| `selectAll` | `boolean` | Show the "Select all" / "Clear" row (default `true`). |
| `searchThreshold` | `number` | Show a search‑within box once options exceed this (default `8`). |

### range

A numeric min/max range over a quantitative field (dual‑thumb slider). Emits a `range`.

| Field | Type | Notes |
| --- | --- | --- |
| `min` / `max` | `number` | Bounds; default to the data min/max of `field`. |
| `step` | `number` | Thumb step; defaults to a fraction of the range. |
| `format` | `string` | Number [format hint](#format-mini-language) for value labels. |

### dateRange

A temporal min/max range over a date field, with relative presets. Emits a `range`.

| Field | Type | Notes |
| --- | --- | --- |
| `presets` | `boolean` | Show relative presets (last 7/30/90 days, all). Default `true`. |
| `format` | `string` | Date [format hint](#format-mini-language) for value labels. |

→ [`examples/slicer-dropdown.json`](./examples/slicer-dropdown.json)

---

## Interactivity (selection · highlight · filter)

The unit of interactivity is a **selection** — a named, JSON‑serializable value a
visual *publishes* and others *consume*. Selections are plain data (no callbacks), so
specs still round‑trip through `JSON.stringify`. Inspired by Vega‑Lite params, pared
down to point/interval definitions and four resolved value shapes.

**Publish — `params`.** A `SelectionParam` names a selection a visual writes when the
user clicks a mark, brushes, or changes a slicer:

```jsonc
"params": [{
  "name": "pick",
  "select": {
    "type": "point",        // 'point' (discrete picks) | 'interval' (a range)
    "on": "click",          // 'click' (default) | 'hover'
    "fields": ["region"],   // identity fields; default = the chart's key channel
    "toggle": true,         // click to add/remove (default true for click)
    "empty": "all"          // empty selection ⇒ match all (default) | none
  }
}]
```

**Consume — `highlight` & `filter`.** `highlight: { param }` emphasizes rows matching a
param and dims the rest (per‑mark, ~22% dim alpha); an array unions several sources.
`filter` subsets rows to those matching **every** clause (logical AND). Each clause is a
named param or a literal predicate:

| Clause | Shape | Meaning |
| --- | --- | --- |
| param | `{ "param": "region" }` | Match the param's current value. |
| equals | `{ "field": "region", "equals": "West" }` | `field === value`. |
| oneOf | `{ "field": "region", "oneOf": ["West","East"] }` | Membership. |
| range | `{ "field": "sales", "range": [100, 500] }` | Inclusive numeric/temporal span. |
| contains | `{ "field": "product", "contains": "wid" }` | Case‑insensitive substring. |

**Resolved value shapes** (`SelectionValue` — what `getSelection` returns and
`setSelection` accepts):

| `kind` | Shape | Emitted by |
| --- | --- | --- |
| `point` | `{ kind, fields, tuples }` | clicking marks |
| `set` | `{ kind, field, values }` | `dropdown`, `list` |
| `range` | `{ kind, field, min?, max? }` | `range`, `dateRange`, brushing |
| `text` | `{ kind, field, query }` | `search` |

To link **independently rendered** charts, pass a shared store:

```ts
import { render, createSelectionStore } from 'graphein';
const store = createSelectionStore();
render('#a', specA, { store });   // a publishes `params`
render('#b', specB, { store });   // b consumes via `highlight`/`filter`
```

---

## Dashboards

A `dashboard` is the single‑JSON, agent‑facing layer that composes charts and slicers
into one cross‑interacting page. It owns a shared dataset and selection store, lays
views out on a responsive grid, and **auto‑wires** cross‑interaction. Validated by
`validateSpec`; rendered with `renderDashboard`.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `type` | `'dashboard'` | — | Discriminator. |
| `data` | `Datum[]` | — | Shared dataset; views without their own `data` inherit it. |
| `views` | `DashboardView[]` | **required** | The placed charts/slicers. |
| `layout` | `DashboardLayout` | see below | Grid sizing + responsive behavior. |
| `interactions` | `'auto' \| 'none' \| InteractionLink[]` | `'auto'` | Cross‑interaction policy. |
| `params` | `SelectionParam[]` | — | Dashboard‑level selections (e.g. seeded initial values). |
| `subtitle` | `string` | — | Muted line shown under the title in the page header. |
| `theme` `title` `background` `dimensions` | — | — | Page chrome; `theme` cascades to every view. |

**`DashboardLayout`** — `{ cols?, rowHeight?, gap?, breakpoints?, navigators?, sections?, preset?, maxWidth?, density?, padding? }`:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `cols` | `number` | `12` | Grid columns at full width. |
| `rowHeight` | `number` | `96` | Height of one grid row (px). |
| `gap` | `number` | `14` | Gap between cells (px). |
| `breakpoints` | `{ maxWidth, cols }[]` | `[{600,1},{960,6}]` | Responsive column counts: when narrower than a breakpoint's `maxWidth`, the grid switches to its `cols` and tiles reflow (DataZen‑style). Smallest match wins. |
| `navigators` | `'top' \| 'inline'` | `'top'` | `top`: compact slicers (`dropdown`/`search`/`range`/`dateRange`) form a navigator strip above the grid (a BI filter bar); `inline`: every slicer is placed in the grid like a chart. |
| `sections` | `DashboardSection[]` | — | Stack multiple section grids with header bands; views omitted from all sections render in an implicit trailing section. |
| `preset` | `'auto' \| 'kpi-first' \| 'sidebar'` | `'auto'` | Auto-arrange unplaced views. Explicit `x`/`y`/`w`/`h` placement always wins. |
| `maxWidth` | `number` | — | Constrain and center the dashboard page. |
| `density` | `'compact' \| 'standard' \| 'comfortable'` | `'standard'` | Applies spacing/row-height presets before explicit `gap`/`rowHeight` overrides. |
| `padding` | `number` | derived from `gap` | Page padding in px. |

**`DashboardSection`**:

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `id` | `string` | — | Optional stable id for the section. |
| `title` / `subtitle` | `string` | — | Header band copy above the section grid. |
| `views` | `string[]` | **required** | View ids in this section; each id may appear in only one section. |
| `cols` | `number` | layout `cols` | Section-specific columns. |
| `rowHeight` | `number` | layout `rowHeight` | Section-specific row height. |
| `background` | `string` | transparent | Header band tint. |
| `collapsed` | `boolean` | `false` | Start with the body hidden behind a clickable header. |

**`DashboardView`** — `{ id, spec, x?, y?, w?, h?, title?, subtitle?, frame?, background?, accent?, padding?, responsive? }`.
`id` is unique within the dashboard (used for layout + link references). `spec` is any
chart or slicer spec (inherits the dashboard's `data` when it has none). `x`/`y` are
1‑based grid placement (omit to auto‑flow); `w`/`h` are column/row spans (sensible
per‑type defaults).

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `title` / `subtitle` | `string` | — | Card header drawn by the dashboard. When present, Graphein suppresses the inner chart `title` to avoid duplicate headings. |
| `frame` | `boolean` | `true` | Draw the framed card chrome. Set `false` for frameless tiles. |
| `background` | `string` | theme surface | Card background override. |
| `accent` | `string` | — | Solid left accent bar color. |
| `padding` | `'none' \| 'standard'` | `'standard'` | Use `'none'` for flush tables/maps. |
| `responsive` | `{ maxWidth, w?, h?, hidden? }[]` | — | Per-view span overrides at section/dashboard widths; smallest matching `maxWidth` wins. |

**`interactions: 'auto'`** (Power BI semantics):

- **Slicers filter the whole page** — every non‑slicer view whose data contains the
  field is subset by the slicer (a KPI, a table, a chart that inherits the dashboard
  data). A filter on a column a view's data doesn't contain is **ignored for that view**,
  not blanked — so a pre‑aggregated view only reacts to the dimensions it carries.
- **Chart clicks cross‑highlight** — clicking a mark emphasizes the matching subset in
  views that encode the same field, and always self‑highlights.

**Explicit links** replace auto‑wiring with an array of `InteractionLink`:

| Field | Type | Notes |
| --- | --- | --- |
| `source` | `string` | View id whose selection drives the interaction. |
| `target` | `string \| string[] \| '*'` | Target view id(s), or `'*'` for every other view. |
| `as` | `'highlight' \| 'filter' \| 'none'` | How targets react (defaults by source type). |
| `fields` | `string[]` | Identity fields to match on; defaults to the source's key field(s). |

```jsonc
"interactions": [
  { "source": "region", "target": "*", "as": "filter" },
  { "source": "byRegion", "target": ["trend"], "as": "highlight", "fields": ["region"] }
]
```

`renderDashboard(target, spec, options?)` returns a **`DashboardInstance`**:
`update(next)`, `resize()`, `destroy()`, `spec`, plus the
[selection API](#runtime-api) (`getSelection` / `setSelection` / `clearSelection` /
`on('selectionchange', …)` / `off`) and `views` (the wired view specs).

→ [`examples/dashboard.json`](./examples/dashboard.json)

---

## Conditional formatting

Used by `table` columns and `matrix` values.

```jsonc
// In‑cell horizontal bar sized by value; zero-baseline bars diverge for negatives
{ "type": "bar", "color": "#0d9488", "negativeColor": "#dc2626", "baseline": "zero" }

// Background or text color scale
{ "type": "colorScale", "scheme": "teal", "domain": [0, 1], "target": "background" }

// Unicode icon set (no icon fonts)
{ "type": "icon", "set": "arrows", "position": "left" }

// First matching rule wins
{ "type": "rules", "rules": [{ "when": "lt", "value": 0, "color": "#dc2626", "weight": "bold" }] }
```

| Field | Type | Applies to | Notes |
| --- | --- | --- | --- |
| `type` | `'bar' \| 'colorScale' \| 'icon' \| 'rules'` | all | Selects the style. |
| `domain` | `[number, number]` | `bar`, `colorScale` | Value range; inferred from the column when omitted. |
| `color`, `negativeColor`, `baseline`, `showValue` | strings/boolean | `bar` | Bar fill, diverging negative fill, zero/min baseline, and value overlay toggle. |
| `scheme`, `midpoint`, `diverging`, `target` | mixed | `colorScale` | Sequential/diverging ramp controls; `target:'text'` colors text instead of background. |
| `set`, `rules`, `position` | mixed | `icon` | Built-ins: `arrows`, `triangles`, `dots`, `trafficLights`; rules override thresholds. |
| `rules` | `ValueRule[]` | `rules` | `when`: `gt`, `gte`, `lt`, `lte`, `eq`, `ne`, `between`; `between` is inclusive and needs `to`. |

Icon glyphs are Unicode: arrows `▲ ▬ ▼`, triangles `▲ ▼`, dots/traffic lights `●` with green/amber/red tones.

---

## Themes

`theme` is either a built‑in name (`'light'` / `'dark'`) or a partial override
with an optional `base`:

```jsonc
"theme": { "base": "dark", "color": { "accent": "#2dd4bf" } }
```

Overridable token groups: `color` (`background`, `surface`, `text`, `textMuted`,
`axis`, `grid`, `border`, `accent`, `palette[]`, `positive`, `negative`),
`font`, `spacing`, `radius`, `stroke`. The default categorical `palette` is a
vibrant, accessibility‑tuned 10‑color set that reads well on light and dark.

---

## Format mini‑language

A small, dependency‑free subset of d3‑format (numbers) plus strftime‑style dates.

**Numbers** — grammar `[$][,][.precision][type]`:

| Hint | Input | Output |
| --- | --- | --- |
| `,d` | `1234567` | `1,234,567` |
| `.1f` | `3.14159` | `3.1` |
| `.0%` | `0.42` | `42%` |
| `$,.0f` | `5230` | `$5,230` |
| `.1s` | `1200` | `1.2k` |
| `.2e` | `12300` | `1.23e+4` |
| `.3g` | `12345` | `12300` |

**Dates** — a hint containing `%` is treated as a date pattern. Tokens:
`%Y` (2024), `%y` (24), `%m` (01), `%d` (01), `%e` (1), `%B`/`%b` (January/Jan),
`%A`/`%a` (Monday/Mon), `%H` (00‑23), `%I` (01‑12), `%M`, `%S`, `%L` (ms),
`%p` (AM/PM), `%j` (day of year), `%%` (literal `%`). Example: `%b %e, %Y` →
`Jan 2, 2024`.

---

## Enumerations

| Name | Values |
| --- | --- |
| `ChartType` | `line`, `area`, `bar`, `scatter`, `pie`, `funnel`, `heatmap`, `kpi`, `table`, `matrix`, `box`, `sankey`, `choropleth`, `dropdown`, `search`, `list`, `range`, `dateRange` |
| `SlicerType` | `dropdown`, `search`, `list`, `range`, `dateRange` |
| `SelectionKind` | `point`, `set`, `range`, `text` |
| `FieldType` | `quantitative`, `temporal`, `ordinal`, `nominal` |
| `AggOp` | `sum`, `mean`, `avg`, `min`, `max`, `count`, `countDistinct`, `median`, `first`, `last` |
| `CurveType` | `linear`, `monotone`, `step`, `stepBefore`, `stepAfter`, `catmullRom` |
| `MapProjection` | `mercator`, `equirectangular`, `identity` |
| Sequential schemes | `blues`, `teal`, `viridis`, `magma`, `greys` |
| Diverging schemes | `redBlue`, `spectral`, `blueRed` |
| `LegendPosition` | `top`, `right`, `bottom`, `left` |

---

## Runtime API

```ts
import { render } from 'graphein';

const chart = render(target, spec); // target: HTMLElement | CSS selector string
chart.update(nextSpec);             // re-render with new data/config
chart.resize(width?, height?);      // re-measure (or force explicit dims) and redraw
chart.destroy();                    // tear down DOM, observers, listeners
chart.spec;                         // the currently rendered spec (readonly)
```

`render()` returns a **`ChartInstance`**. With responsive `dimensions` (the
default), the chart tracks its container via `ResizeObserver`. When a render
settles, Graphein sets `data-graphein-ready="true"` on the surface root and increments
`window.__GRAPHEIN_READY` — handy for screenshot/automation tooling to wait on.

### Validation & linting

```ts
import { validateSpec, lintSpec } from 'graphein';

const { valid, errors, warnings } = validateSpec(spec);
```

`validateSpec(spec)` returns `{ valid, errors, warnings }`. Each item is a
`ValidationError` `{ path, message, rule?, severity?, fix?, suggestion? }`:

- **`errors`** are structural problems (missing channel, bad enum, unknown field).
  Fix every one — `valid` is `false` while any remain.
- **`warnings`** include **dataviz lint** findings: best-practice advice that never
  blocks rendering. Lint findings carry a stable `rule` id and a `severity`
  (`'warning'` | `'info'`) so you can recognize or suppress a specific one.
- **`fix`** — when the right correction is unambiguous (a misspelled chart `type`
  or enum value, a temporal-looking field typed as a category), the error carries
  a list of **JSON Patch** (RFC 6902) ops that resolve it. Apply them directly
  instead of regenerating, or let [`repairSpec`](#self-repairing-specs) do it.
- **`suggestion`** — `{ kind, candidates }` "did you mean" hints (nearest first)
  for an unrecognized `type`, enum, or field name. Suggestions are advisory; only
  the unambiguous ones also come with a `fix`.

`lintSpec(spec)` runs just the lint rules (also reachable via `validateSpec`
warnings). Current rules:

| `rule` | Fires when |
| --- | --- |
| `temporal-typed-as-categorical` | a date‑like field is typed `nominal`/`ordinal` (set `type:"temporal"`). |
| `pie-too-many-slices` | a pie/donut has more than 7 slices. |
| `too-many-series` | a `series`/`color` field has more than 12 distinct values. |
| `bar-nonzero-baseline` | a bar's `y` scale disables zero (`zero:false`) or starts above 0. |
| `log-nonpositive-data` | a `log` axis covers data with values ≤ 0. |
| `high-cardinality-axis` | a discrete `x`/`y` axis has more than 50 categories. |

Lint rules evaluate the **post‑`transform`** data, so cardinality reflects what
actually renders.

### Self-repairing specs

```ts
import { repairSpec } from 'graphein';

const { spec, applied, remaining } = repairSpec(brokenSpec);
// spec      → a corrected copy (input is never mutated)
// applied   → the JsonPatchOp[] that were applied, in order
// remaining → structural errors still unresolved (empty ⇒ the spec is now valid)
```

`repairSpec(spec)` applies every **safe, unambiguous** `fix` that `validateSpec`
attaches, then re-validates — iterating, because one fix can unlock another (e.g.
correcting `type` changes which channels are required). It only applies fixes the
validator is confident about; genuinely ambiguous problems (a missing channel
with no obvious field, a far-from-anything type) are left in `remaining` for you
to resolve. This turns the common agent mistakes — a typo'd chart type, a
misspelled aggregate `op`, a date field typed `nominal` — into a one-step
correction rather than a full regenerate.

You can also apply fixes yourself with the exported JSON Patch helpers
`applyPatch(doc, ops)` and `toPointer(dottedPath)`.

### Render report

After a chart draws, `instance.report()` returns a **machine-readable** description
of what was actually rendered — so an agent can verify the chart "looks right"
without ever seeing a pixel. It closes the critique loop: generate → validate →
render → **report** → repair.

```ts
const chart = render('#app', spec);
const report = chart.report();
// report.ok          → true when no warning/error diagnostics were raised
// report.markCount   → number of data marks drawn
// report.seriesCount → distinct series
// report.colorCount  → distinct series colors
// report.plot        → the plot rectangle (cartesian charts)
// report.diagnostics → RenderDiagnostic[] (most-severe first)
for (const d of report.diagnostics) {
  // d.code · d.severity ('error' | 'warning' | 'info') · d.message · d.axis? · d.details?
}
```

`buildRenderReport(input)` is also exported as a pure function if you want to
compute a report outside the render lifecycle. The report is derived entirely
from the resolved model (scales, ticks, legend, theme colors) — **no canvas
read-back** — so it returns identically in the browser and headless. To run the
loop server-side, [`@graphein/node`](https://www.npmjs.com/package/@graphein/node)'s
`renderChart(spec)` returns the PNG **and** this report; core's dependency-free
`renderToContext(target, spec)` returns it while painting onto any 2D context.

**Diagnostic codes**

| `code` | Severity | Meaning |
| --- | --- | --- |
| `empty-data` | warning | No rows to plot — the chart is blank. |
| `empty-plot` | error | The plot area collapsed (chrome ate all the space). |
| `axis-label-overlap` | warning | Adjacent x-axis category labels collide — too many to show. |
| `legend-overflow` | warning | A vertical legend was truncated; some series aren't shown. |
| `degenerate-axis` | warning/info | The y values are all equal (flat line) or the scale is too narrow. |
| `marks-clipped` | warning | Data falls outside the y range and is clipped at the plot edge. |
| `low-contrast-mark` | warning | A series color is nearly invisible against the background. |
| `low-contrast-text` | warning | Axis/legend label color fails the 4.5:1 text-contrast minimum. |
| `too-many-colors` | info | More than ~8 series share one color scale — hard to tell apart. |

In `@graphein/react`, read the report from the instance handed to `onReady`:
`<Chart spec onReady={(c) => console.log(c.report())} />`.

### Selections & dashboards

Both `ChartInstance` and `DashboardInstance` expose an imperative **selection API**,
and `renderDashboard` mounts a whole [dashboard](#dashboards) spec:

```ts
import { renderDashboard, render, createSelectionStore } from 'graphein';

const d = renderDashboard(target, dashboardSpec);
d.getSelection(name?);                 // current SelectionValue (or a map when name omitted)
d.setSelection('region', value);       // drive a param programmatically
d.clearSelection(name?);               // clear one / all params
const off = d.on('selectionchange', (name, value) => {/* … */});
off();                                 // or d.off('selectionchange', fn)
d.update(next); d.resize(); d.destroy(); d.spec; d.views; d.store;

// Linking standalone charts: share one store across render() calls.
const store = createSelectionStore();
const a = render('#a', specA, { store, onSelectionChange: (n, v) => {} });
```

`render(target, spec, options?)` accepts `{ store?, onSelectionChange? }` (both
optional, backward compatible). In `@graphein/react`, `<Dashboard spec onSelectionChange? />`,
`<Chart spec store? onSelectionChange? />`, and `useSelection(target, name?) → [value, setValue]`
mirror this surface.

### Performance

- **LTTB decimation** downsamples very large line/area series to roughly one point
  per pixel for drawing, while hit‑testing/tooltips keep full resolution. A 50k‑point
  series renders crisply and pans smoothly.
- **Layered canvases:** hover/crosshair paints only an interaction layer, never the
  marks layer — so interaction never triggers a full redraw.
- **Virtualized tables** window rows so `table`/`matrix` stay responsive at large
  row counts.

### Animation

Charts play a brief **entrance animation** the first time they render; **resizes**
are always instant (no re‑animation, no jank while dragging):

- **Cartesian charts** (line/area/bar/scatter/box/heatmap) sweep their marks in
  left‑to‑right with a short fade — the axes, gridlines, and labels are drawn
  immediately so only the data "draws on".
- **Pie, funnel, KPI, sankey, choropleth, tables** fade and rise in subtly.

On **`update()`** (new data or config), canvas‑mark charts
(line/area/bar/scatter/box/pie/heatmap/sankey/choropleth) **cross‑fade** the marks
layer from the previous frame to the next — a smooth dissolve whose final frame is
pixel‑identical to an instant redraw. DOM charts (`kpi`/`table`/`matrix`) update
instantly, and a simultaneous size change snaps (that's a resize, not a data
morph) to avoid a stretched bitmap.

Tuning via the `animation` field:

```jsonc
{ "animation": false }                                  // disable entirely
{ "animation": { "duration": 700, "easing": "cubicOut" } }
```

- Default entrance duration is **480ms** (easing `cubicOut`); the update
  cross‑fade is **360ms** (easing `cubicInOut`).
- **`prefers-reduced-motion`** is honored automatically — when the OS requests
  reduced motion, entrances and update cross‑fades are suppressed and charts
  render directly in their final state.
- Automation/screenshot harnesses can force‑disable all motion by setting
  `window.__GRAPHEIN_DISABLE_ANIM = true` before rendering, which keeps captures
  deterministic without changing any spec.
- **Web fonts:** axis‑gutter and label widths depend on the chart's font. If a
  chart renders before its web font has loaded, it lays out with fallback metrics
  and then **re‑lays‑out automatically once the font loads**, so the final result
  is always correct. (For pixel‑exact screenshots, also `await
  document.fonts.ready` before capturing.)

---

## Accessibility

Every rendered chart is wrapped as an accessible **figure**:

- The surface root gets `role="figure"` and an `aria-label`. Set `description`
  for precise alt text; otherwise Graphein synthesizes one from the type, title, and
  row count (e.g. _"Bar chart: Quarterly revenue. 4 data points."_).
- The canvas layers are `aria-hidden` (decorative). For canvas‑drawn charts
  (line/area/bar/scatter/pie/heatmap) Graphein also injects a **visually‑hidden
  `<table>`** mirroring the data (capped at 100 rows) so screen‑reader users can
  read the underlying numbers. `table`/`matrix` already render a semantic
  `<table>` (with `aria-sort` on sortable headers) and `kpi` renders real text,
  so no fallback is added for those.
- All titles, axis labels, and legends are real DOM text (not canvas pixels), so
  they're selectable and readable by assistive tech.
