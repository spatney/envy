# AGENTS.md

Instructions for AI/coding agents working with **Graphein** — an agent-first data
visualization library. Graphein is designed so you can produce great charts by emitting
a single JSON object. This file is the quick orientation; the deep reference lives in
[`docs/agent-guide.md`](./docs/agent-guide.md) and [`docs/spec-reference.md`](./docs/spec-reference.md).

## Using Graphein to build a chart

**The one rule:** emit a single JSON-serializable `ChartSpec` with a `type`, a flat
`data` array, and (for cartesian charts) an `encoding` mapping columns to channels.

```ts
import { render, validateSpec } from 'graphein';

const spec = {
  type: 'line',
  data: [
    { month: '2024-01', users: 4200 },
    { month: '2024-02', users: 4650 },
    { month: '2024-03', users: 5010 },
  ],
  encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'users' } },
  title: 'Monthly active users',
};

const { valid, errors } = validateSpec(spec); // check BEFORE rendering
const chart = render('#app', spec);
// chart.update(next) · chart.resize() · chart.destroy()
```

### Workflow

1. **Shape data as a tidy table** — one row per observation, one column per variable.
   Don't pre-pivot; add a `series` channel to split groups.
2. **Pick the type** (see the table below), set the `encoding`, add a `title`.
3. **`validateSpec(spec)`** and fix every `error` (warnings are advisory). Validation
   is pure and dependency-free — always run it on generated specs.
4. `render(container, spec)` (or `<Chart spec={…} />` from `@graphein/react`).

### Chart types at a glance

| Goal | `type` | Key channels |
| --- | --- | --- |
| Trend over time | `line` (`area:true` to fill) | `x` temporal, `y`, `series?` |
| Part-to-whole over time | `area` + `stack:true` | `x`, `y`, `series` |
| Compare categories | `bar` (`stack:true` to stack) | `x`, `y`, `series?` |
| Correlation / distribution | `scatter` | `x`, `y`, `size?`, `color?` |
| Composition of a total | `pie` / donut | `theta`, `color` |
| Density across two categories | `heatmap` | `x`, `y`, `color` |
| Spread / distribution by group | `box` | `x` category, `y` observations, `series?` |
| Conversion through stages | `funnel` | `stage`, `value` |
| Flows between nodes | `sankey` | `source`, `target`, `value` |
| Values over map regions | `choropleth` | `key`, `color` (+ top-level `geo`) |
| Headline metric | `kpi` | `value` (+ `delta`, `sparkline`) |
| Tabular detail | `table` | `columns` (+ optional totals, groups, conditional bars/icons/rules) |
| Pivot / cross-tab | `matrix` | `rows`, `columns`, `values` (+ optional `showAs` percentages) |
| Slice/filter a field | `dropdown` · `list` · `search` · `range` · `dateRange` | `field` (+ `param?`) |
| Cross-filtered page | `dashboard` | `views`, `interactions` |

### Interactivity & dashboards

Visuals can publish and consume **selections** (plain JSON — no callbacks). A
selection is *data*; other visuals consume it as a **highlight** (emphasize matches,
dim the rest) or a **filter** (subset rows). Three optional `BaseSpec` fields wire it:

- `params` — named selections a visual publishes (a chart click, a slicer change).
- `highlight: { param }` — emphasize rows matching a param; dim the rest.
- `filter: [{ param } | literal]` — subset rows to those matching every clause.

**Slicers** (`dropdown`, `list`, `search`, `range`, `dateRange`) are first-class
visuals that read one `field` and publish to a `param` (defaulting to the field name,
so a chart's `filter:[{param:'region'}]` auto-connects to a `field:'region'` slicer).

**Dashboards** compose it all in one JSON: a `dashboard` spec lays `views` out on a
grid, shares one dataset + selection store, and `interactions:'auto'` cross-wires the
page — a slicer filters every view whose data carries its field; clicking a chart
cross-highlights charts that share the field. Render with `renderDashboard(container, spec)`.

```ts
import { renderDashboard, validateSpec } from 'graphein';
const dash = {
  type: 'dashboard',
  data: rows,
  layout: { sections: [{ title: 'Overview', views: ['region', 'total'] }, { title: 'Trends', views: ['trend'] }] },
  views: [
    { id: 'region', title: 'Region filter', spec: { type: 'dropdown', field: 'region', multiple: true }, w: 3, h: 2 },
    { id: 'total', title: 'Total sales', accent: '#14b8a6', spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } }, w: 3, h: 2 },
    { id: 'trend', spec: { type: 'line', encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'sales' }, series: { field: 'region' } } }, w: 9, h: 3 },
  ],
  interactions: 'auto',
};
validateSpec(dash); // validates dashboards too
const d = renderDashboard('#app', dash); // d.getSelection() · d.setSelection() · d.on('selectionchange', fn)
```

Dashboard layout supports stacked `layout.sections`, per-view card chrome
(`title`, `subtitle`, `accent`, `frame`, `background`, `padding`), responsive view
spans, presets (`auto`, `kpi-first`, `sidebar`), and page chrome (`maxWidth`,
`density`, `padding`). Use these for polished BI pages while keeping specs plain JSON.

### Gotchas

- Dates may be `Date` objects **or** ISO strings (`"2024-01"`); both coerce for
  `temporal` fields.
- `sankey` needs `source`/`target`/`value`; `choropleth` needs a top-level `geo`
  FeatureCollection plus `key`/`color` and a `featureId` naming the join property.
- Everything is JSON-serializable — no functions in a spec (selections are data too).
- `FieldDef.aggregate` is consumed by `kpi`/`matrix` only; cartesian charts plot rows
  as-is, so **pre-aggregate** (one row per bar) or split with `series`/`matrix`. `pie`
  and `funnel` are the exception — they **sum** their measure per slice/stage for you.
- Table/matrix conditional-format icons are Unicode glyphs; `matrix.values[].showAs`
  computes row/column/total denominators from leaf cells without requiring totals.
- `pie`/donut `labels` accepts a `PieLabels` object — `placement:'auto'` (default)
  draws an **outside callout with a leader line** for any slice too thin to hold an
  inside label, so many small shares stay readable.
- Slicers + `dashboard` add cross-filter/cross-highlight; see "Interactivity" above.
- Full field-by-field docs: [`docs/spec-reference.md`](./docs/spec-reference.md);
  machine-readable [`docs/chart-spec.schema.json`](./docs/chart-spec.schema.json);
  runnable specs in [`docs/examples/`](./docs/examples).

### Explore interactively

`npm run gallery`, then open **Playground** in the sidebar to edit a spec live, load
presets for every chart type and data size, resize the canvas, and shuffle data. The
**Dashboard** route shows a fully auto-wired interactive dashboard (slicers + cross-
highlight) you can copy.

## Contributing to this repo

- Monorepo via npm workspaces: `graphein` (engine, zero deps), `@graphein/react`
  (wrapper), `apps/gallery` (Vite harness), `tests/visual` (Playwright shots).
- `npm install` · `npm run build` · `npm test` · `npm run typecheck` · `npm run lint`.
- The core engine is **dependency-free** — do not add runtime dependencies to
  `graphein`. Keep exports explicit and tree-shakeable.
- Validate visual changes against the gallery/screenshot harness, not by assumption.
