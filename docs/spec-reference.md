# Envy Spec Reference

Every Envy chart is described by a single **`ChartSpec`** — a plain, JSON‑serializable
object. There are no functions, classes, or callbacks in a spec, so specs round‑trip
through `JSON.stringify` and are safe for a coding agent to emit, store, and replay.

```ts
import { render } from '@envy/core';

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
- [Chart types](#chart-types)
  - [line](#line) · [area](#area) · [bar](#bar) · [scatter](#scatter) · [pie](#pie)
  - [heatmap](#heatmap) · [kpi](#kpi) · [table](#table) · [matrix](#matrix)
- [Conditional formatting](#conditional-formatting)
- [Themes](#themes)
- [Format mini‑language](#format-mini-language)
- [Enumerations](#enumerations)
- [Runtime API](#runtime-api)
  - [Performance](#performance) · [Animation](#animation)
- [Accessibility](#accessibility)

---

## Common fields (`BaseSpec`)

Shared by **all** chart types.

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `data` | `Datum[]` | — | Row‑oriented records. Required for every chart/table. |
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
| `color` | heatmap, pie | Continuous color (heatmap) or slice color (pie). |
| `size` | scatter | Bubble radius. |
| `series` | line, area, bar | Splits data into multiple series (multi‑line, grouped/stacked bars, stacked areas). |
| `theta` | pie | Angular measure (the slice value). |
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
> (`"2024-01-15"`, `"2024-01"`) or epoch milliseconds. Envy parses them for time
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

### pie

Pie or donut with value/percent labels and slice‑lift hover.

| Field | Type | Notes |
| --- | --- | --- |
| `encoding` | requires `theta`, `color` | `theta` = value, `color` = slice category. |
| `donut` | `boolean \| number` | `true` for a default donut, or a `0..1` inner‑radius ratio. |
| `labels` | `boolean` | Show value/percent labels (default `true`). |

→ [`examples/pie-donut.json`](./examples/pie-donut.json)

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
| `conditionalFormat` | `ConditionalFormat` | In‑cell bar or color scale. |

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

**`MatrixValueDef`**

| Field | Type | Notes |
| --- | --- | --- |
| `field` | `string` | **Required.** Measure column. |
| `op` | `AggOp` | **Required.** Aggregation (`sum`, `mean`, `count`, …). |
| `label` | `string` | Header label for the measure. |
| `format` | `string` | [Format hint](#format-mini-language). |
| `conditionalFormat` | `ConditionalFormat` | Per‑cell formatting. |

→ [`examples/matrix.json`](./examples/matrix.json)

---

## Conditional formatting

Used by `table` columns and `matrix` values.

```jsonc
// In‑cell horizontal bar sized by value
{ "type": "bar", "color": "#0d9488", "domain": [0, 10000] }

// Background color scale
{ "type": "colorScale", "scheme": "teal", "domain": [0, 1] }
```

| Field | Type | Applies to | Notes |
| --- | --- | --- | --- |
| `type` | `'bar' \| 'colorScale'` | both | Selects the style. |
| `color` | `string` | `bar` | Bar fill (defaults to the accent). |
| `scheme` | `string` | `colorScale` | Sequential ramp name. |
| `domain` | `[number, number]` | both | Value range; inferred from the column when omitted. |

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
| `ChartType` | `line`, `area`, `bar`, `scatter`, `pie`, `heatmap`, `kpi`, `table`, `matrix` |
| `FieldType` | `quantitative`, `temporal`, `ordinal`, `nominal` |
| `AggOp` | `sum`, `mean`, `avg`, `min`, `max`, `count`, `countDistinct`, `median`, `first`, `last` |
| `CurveType` | `linear`, `monotone`, `step`, `stepBefore`, `stepAfter`, `catmullRom` |
| Sequential schemes | `blues`, `teal`, `viridis`, `magma`, `greys` |
| Diverging schemes | `redBlue`, `spectral`, `blueRed` |
| `LegendPosition` | `top`, `right`, `bottom`, `left` |

---

## Runtime API

```ts
import { render } from '@envy/core';

const chart = render(target, spec); // target: HTMLElement | CSS selector string
chart.update(nextSpec);             // re-render with new data/config
chart.resize(width?, height?);      // re-measure (or force explicit dims) and redraw
chart.destroy();                    // tear down DOM, observers, listeners
chart.spec;                         // the currently rendered spec (readonly)
```

`render()` returns a **`ChartInstance`**. With responsive `dimensions` (the
default), the chart tracks its container via `ResizeObserver`. When a render
settles, Envy sets `data-envy-ready="true"` on the surface root and increments
`window.__ENVY_READY` — handy for screenshot/automation tooling to wait on.

### Performance

- **LTTB decimation** downsamples very large line/area series to roughly one point
  per pixel for drawing, while hit‑testing/tooltips keep full resolution. A 50k‑point
  series renders crisply and pans smoothly.
- **Layered canvases:** hover/crosshair paints only an interaction layer, never the
  marks layer — so interaction never triggers a full redraw.
- **Virtualized tables** window rows so `table`/`matrix` stay responsive at large
  row counts.

### Animation

Charts play a brief **entrance animation** the first time they render (resizes and
`update()` redraws are instant — no re‑animation, no jank):

- **Cartesian charts** (line/area/bar/scatter/heatmap) sweep their marks in
  left‑to‑right with a short fade — the axes, gridlines, and labels are drawn
  immediately so only the data "draws on".
- **Pie, KPI, tables** fade and rise in subtly.

Tuning via the `animation` field:

```jsonc
{ "animation": false }                                  // disable entirely
{ "animation": { "duration": 700, "easing": "cubicOut" } }
```

- Default duration is **480ms**, default easing **`cubicOut`**.
- **`prefers-reduced-motion`** is honored automatically — when the OS requests
  reduced motion, charts render in their final state with no animation.
- Automation/screenshot harnesses can force‑disable all entrances by setting
  `window.__ENVY_DISABLE_ANIM = true` before rendering, which keeps captures
  deterministic without changing any spec.

---

## Accessibility

Every rendered chart is wrapped as an accessible **figure**:

- The surface root gets `role="figure"` and an `aria-label`. Set `description`
  for precise alt text; otherwise Envy synthesizes one from the type, title, and
  row count (e.g. _"Bar chart: Quarterly revenue. 4 data points."_).
- The canvas layers are `aria-hidden` (decorative). For canvas‑drawn charts
  (line/area/bar/scatter/pie/heatmap) Envy also injects a **visually‑hidden
  `<table>`** mirroring the data (capped at 100 rows) so screen‑reader users can
  read the underlying numbers. `table`/`matrix` already render a semantic
  `<table>` (with `aria-sort` on sortable headers) and `kpi` renders real text,
  so no fallback is added for those.
- All titles, axis labels, and legends are real DOM text (not canvas pixels), so
  they're selectable and readable by assistive tech.

