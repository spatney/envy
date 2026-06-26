# Envy

> A beautiful, high-performance, **agent-first** data visualization library.

Envy is a from-scratch (zero runtime dependency) visualization toolkit designed so that
**coding agents** can assemble stunning dashboards and reports from declarative,
JSON-serializable chart specs. Think Tableau-class visuals with a tiny, fast, hybrid
Canvas2D + DOM rendering core.

- **One chart = one JSON object.** No callbacks, no DOM wrangling — just a `ChartSpec`.
- **Stunning by default.** Flat, modern light/dark themes, an accessible palette, and
  perceptual (OKLab) color scales.
- **Fast at scale.** LTTB decimation, layered redraw, and virtualized tables keep things
  smooth from a handful of points to 50k+.
- **From scratch.** Scales, ticks, color, shapes, the pivot engine, and the renderer are
  all hand-written — no D3/charting dependencies.

## Install

```bash
npm install @envy/core
```

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

The **gallery** renders a catalog of scenarios across sizes and light/dark themes; a
Playwright screenshot runner captures the matrix so visual quality is verified by
review, not assumed.

## Design references

Built fresh, with lessons borrowed from the best of open source: **D3** (scale/tick math,
shape generation), **Vega-Lite** (declarative encoding grammar), **uPlot/ECharts/Chart.js**
(canvas performance, layered redraw), **Observable Plot** (sensible-defaults API),
**LTTB** (series decimation), and **OKLab/OKLCH** (perceptual color).
