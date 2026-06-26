# Envy

> A beautiful, high-performance, **agent-first** data visualization library.

Envy is a from-scratch (zero runtime dependency) visualization toolkit designed so that
**coding agents** can assemble stunning dashboards and reports from declarative,
JSON-serializable chart specs. Think Tableau-class visuals with a tiny, fast, hybrid
Canvas2D + DOM rendering core.

- **One chart = one JSON object.** No callbacks, no DOM wrangling — just a `ChartSpec`.
- **Stunning by default.** Flat, modern light/dark themes, an accessible palette, and
  perceptual (OKLab) color scales.
- **Hand-drawn mode.** Flip on `sketch: true` for a rough.js-style sketched look —
  wobbly strokes, hachure fills, and a handwriting font — on any chart type.
- **Fast at scale.** LTTB decimation, layered redraw, and virtualized tables keep things
  smooth from a handful of points to 50k+.
- **From scratch.** Scales, ticks, color, shapes, the pivot engine, the sketch
  renderer, and the core renderer are all hand-written — no D3/charting dependencies.

## Gallery

A quick tour of what Envy renders — **every image below is a single declarative `ChartSpec`.**
Explore them live, resize them, and tweak the JSON in the Playground with `npm run gallery`.

<table>
  <tr>
    <td width="50%"><img src="docs/images/line-multi.png" alt="Multi-series line chart"><br><sub><b>line</b> — multi-series with legend</sub></td>
    <td width="50%"><img src="docs/images/bar-grouped.png" alt="Grouped bar chart"><br><sub><b>bar</b> — grouped categories</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/area-stacked.png" alt="Stacked area chart"><br><sub><b>area</b> — stacked over time</sub></td>
    <td><img src="docs/images/scatter-groups.png" alt="Bubble scatter chart"><br><sub><b>scatter</b> — bubble size + color groups</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/donut.png" alt="Donut chart"><br><sub><b>pie</b> — donut with labels</sub></td>
    <td><img src="docs/images/heatmap.png" alt="Heatmap"><br><sub><b>heatmap</b> — week × hour density</sub></td>
  </tr>
  <tr>
    <td><img src="docs/images/box.png" alt="Box-and-whisker plot"><br><sub><b>box</b> — distribution by group</sub></td>
    <td><img src="docs/images/kpi.png" alt="KPI card with sparkline"><br><sub><b>kpi</b> — metric, delta + sparkline</sub></td>
  </tr>
</table>

<table>
  <tr><td><img src="docs/images/sankey.png" alt="Sankey flow diagram"><br><sub><b>sankey</b> — weighted flows from <code>source → target</code></sub></td></tr>
  <tr><td><img src="docs/images/choropleth.png" alt="US choropleth map"><br><sub><b>choropleth</b> — values shaded over GeoJSON regions</sub></td></tr>
  <tr><td><img src="docs/images/table.png" alt="Data table with conditional formatting"><br><sub><b>table</b> — virtualized, sortable, with bar + color-scale conditional formatting</sub></td></tr>
  <tr><td><img src="docs/images/line-dense.png" alt="50,000-point line chart"><br><sub><b>line</b> — 50,000 points, LTTB-downsampled, still smooth</sub></td></tr>
</table>

### One spec, three looks

The same `area` chart in light, dark, and hand-drawn (`"sketch": true`) modes — just flip a field:

<table>
  <tr>
    <td width="33%"><img src="docs/images/modes-light.png" alt="Light theme"><br><sub>Light</sub></td>
    <td width="33%"><img src="docs/images/modes-dark.png" alt="Dark theme"><br><sub>Dark</sub></td>
    <td width="33%"><img src="docs/images/modes-sketch.png" alt="Hand-drawn sketch mode"><br><sub>Sketch</sub></td>
  </tr>
</table>

## Install

From npm (recommended):

```bash
npm install @envy/core
# React wrapper (optional):
npm install @envy/react react
```

### Install from GitHub

You can also install straight from the repo — handy for trying unreleased work or
pinning an exact ref. Reference a **version tag** (or any branch/commit):

```bash
# the zero-dependency engine, importable as `envy`
npm install github:spatney/envy#v0.1.0

import { render } from 'envy';
```

```jsonc
// package.json
{
  "dependencies": {
    "envy": "github:spatney/envy#v0.1.0"
  }
}
```

> The GitHub install exposes the core engine under the bare name **`envy`**. For
> the scoped packages (`@envy/core`, `@envy/react`) and fine-grained versioning,
> install from npm. Tags are published as `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`).

## Quick start

```ts
import { render } from '@envy/core';

const chart = render('#app', {
  type: 'line',
  title: 'Monthly active users',
  data: [
    { month: '2024-01', users: 4200 },
    { month: '2024-02', users: 4650 },
    { month: '2024-03', users: 5010 },
    { month: '2024-04', users: 4880 },
    { month: '2024-05', users: 5430 },
    { month: '2024-06', users: 6120 },
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'users', type: 'quantitative', format: ',d' },
  },
});

// later…
chart.update(nextSpec);  // new data/config
chart.resize();          // re-measure after a layout change
chart.destroy();         // tear down
```

### React

```tsx
import { Chart } from '@envy/react';

function Dashboard({ spec }) {
  return (
    <div style={{ height: 360 }}>
      <Chart spec={spec} />
    </div>
  );
}
```

`<Chart spec={…} />` renders into a fill-by-default container; pass a new `spec`
to update in place, and it tears down on unmount. For headless control over your
own element, use the `useChart(spec)` hook (returns a ref to attach). `react` is a
peer dependency (React 18+).

## Chart catalog

| Type | What it's for | Example |
| --- | --- | --- |
| `line` | Trends over time; multi-series, curves, markers, area fill | [line.json](./docs/examples/line.json) |
| `area` | Volume/part-to-whole over time; stacking | [area-stacked.json](./docs/examples/area-stacked.json) |
| `bar` | Compare categories; grouped or stacked series | [bar-grouped.json](./docs/examples/bar-grouped.json) |
| `scatter` | Correlation/distribution; bubble size + color groups | [scatter.json](./docs/examples/scatter.json) |
| `pie` | Composition as shares; pie or donut | [pie-donut.json](./docs/examples/pie-donut.json) |
| `heatmap` | Density across two categories | [heatmap.json](./docs/examples/heatmap.json) |
| `kpi` | Headline metric with delta + sparkline | [kpi.json](./docs/examples/kpi.json) |
| `table` | Virtualized, sortable data table + conditional formatting | [table.json](./docs/examples/table.json) |
| `matrix` | Pivot/cross-tab: groups, aggregates, subtotals/grand totals | [matrix.json](./docs/examples/matrix.json) |
| `box` | Distributions by category; Tukey/min-max whiskers + outliers | [box.json](./docs/examples/box.json) |
| `sankey` | Flows between nodes from `source → target` link rows | [sankey.json](./docs/examples/sankey.json) |
| `choropleth` | Values shaded over GeoJSON regions; sequential color scale | [choropleth.json](./docs/examples/choropleth.json) |

Add `"sketch": true` to **any** spec for a hand-drawn look — see
[bar-sketch.json](./docs/examples/bar-sketch.json) and the
[`SketchConfig` reference](./docs/spec-reference.md#sketchconfig).

## Documentation

- **[Agent Guide](./docs/agent-guide.md)** — the playbook for generating charts &
  dashboards: data shaping, chart selection, recipes, and gotchas.
- **[Spec Reference](./docs/spec-reference.md)** — every field of every chart type,
  encoding channels, scales, themes, and the format mini-language.
- **[JSON Schema](./docs/chart-spec.schema.json)** — machine-readable `ChartSpec` schema
  for validation and editor autocomplete.
- **[Examples](./docs/examples)** — a runnable JSON spec for every chart type.

## How it works

- **Hybrid rendering** — Canvas2D draws data marks and gridlines; an absolutely
  positioned HTML/SVG overlay handles crisp text (axis labels, legend, titles, tooltips,
  KPI cards) and accessibility.
- **Declarative spec → scales → marks** — a Vega-Lite-flavored encoding maps data
  columns onto visual channels. A layout engine reserves space for axes/legend/title,
  then charts draw into the plot rect. Hi-DPI aware, single batched redraw.
- **Interaction** — hover tooltips, crosshair, focus highlight, and slice/cell emphasis
  paint on a separate interaction canvas, so hovering never triggers a full mark redraw.
- **Ready signal** — when a render settles, Envy sets `data-envy-ready="true"` on the
  surface root and increments `window.__ENVY_READY`, so automation can wait
  deterministically.

## Packages

| Package | Description | Status |
| --- | --- | --- |
| `@envy/core` | Framework-agnostic engine, scales, charts, tables (zero deps). | ✅ |
| `@envy/react` | Thin React wrapper: `<Chart spec={...} />`. | ✅ |
| `apps/gallery` | Vite gallery + screenshot harness for visual iteration. | ✅ (dev) |

## Development

This is a monorepo managed with npm workspaces.

```bash
npm install
npm run build       # build all packages
npm test            # run unit tests (Vitest)
npm run typecheck   # type-check all workspaces
npm run gallery     # launch the Vite gallery harness for visual iteration
```

The **gallery** opens on an **Overview** — a mosaic of every chart type, each one a single
`ChartSpec`, with global light/dark and hand-drawn **sketch** toggles. Pick any chart to see
it large alongside its spec and a responsive size strip; a Playwright screenshot runner
captures the matrix so visual quality is verified by review, not assumed. It also ships a
**Playground** (`npm run gallery`, then pick *Playground* in the sidebar) where you can edit a
`ChartSpec` live, seed it from presets spanning every chart type and data size, drag to resize
the canvas, and shuffle the data to watch the update transitions.

## Design references

Built fresh, with lessons borrowed from the best of open source: **D3** (scale/tick math,
shape generation), **Vega-Lite** (declarative encoding grammar), **uPlot/ECharts/Chart.js**
(canvas performance, layered redraw), **Observable Plot** (sensible-defaults API),
**LTTB** (series decimation), and **OKLab/OKLCH** (perceptual color).
