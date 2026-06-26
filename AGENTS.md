# AGENTS.md

Instructions for AI/coding agents working with **Envy** — an agent-first data
visualization library. Envy is designed so you can produce great charts by emitting
a single JSON object. This file is the quick orientation; the deep reference lives in
[`docs/agent-guide.md`](./docs/agent-guide.md) and [`docs/spec-reference.md`](./docs/spec-reference.md).

## Using Envy to build a chart

**The one rule:** emit a single JSON-serializable `ChartSpec` with a `type`, a flat
`data` array, and (for cartesian charts) an `encoding` mapping columns to channels.

```ts
import { render, validateSpec } from '@envy/core';

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
4. `render(container, spec)` (or `<Chart spec={…} />` from `@envy/react`).

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
| Flows between nodes | `sankey` | `source`, `target`, `value` |
| Values over map regions | `choropleth` | `key`, `color` (+ top-level `geo`) |
| Headline metric | `kpi` | `value` (+ `delta`, `sparkline`) |
| Tabular detail | `table` | `columns` |
| Pivot / cross-tab | `matrix` | `rows`, `columns`, `values` |

### Gotchas

- Dates may be `Date` objects **or** ISO strings (`"2024-01"`); both coerce for
  `temporal` fields.
- `sankey` needs `source`/`target`/`value`; `choropleth` needs a top-level `geo`
  FeatureCollection plus `key`/`color` and a `featureId` naming the join property.
- Everything is JSON-serializable — no functions in a spec.
- Full field-by-field docs: [`docs/spec-reference.md`](./docs/spec-reference.md);
  machine-readable [`docs/chart-spec.schema.json`](./docs/chart-spec.schema.json);
  runnable specs in [`docs/examples/`](./docs/examples).

### Explore interactively

`npm run gallery`, then open **Playground** in the sidebar to edit a spec live, load
presets for every chart type and data size, resize the canvas, and shuffle data.

## Contributing to this repo

- Monorepo via npm workspaces: `@envy/core` (engine, zero deps), `@envy/react`
  (wrapper), `apps/gallery` (Vite harness), `tests/visual` (Playwright shots).
- `npm install` · `npm run build` · `npm test` · `npm run typecheck` · `npm run lint`.
- The core engine is **dependency-free** — do not add runtime dependencies to
  `@envy/core`. Keep exports explicit and tree-shakeable.
- Validate visual changes against the gallery/screenshot harness, not by assumption.
