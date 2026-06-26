# Envy

> A beautiful, high-performance, agent-first data visualization library.

Envy is a from-scratch (zero runtime dependency) visualization toolkit designed so that
**coding agents** can assemble stunning dashboards and reports from declarative,
JSON-serializable chart specs. Think Tableau-class visuals with a tiny, fast, hybrid
Canvas2D + DOM rendering core.

## Packages

| Package | Description |
| --- | --- |
| `@envy/core` | Framework-agnostic rendering engine, scales, charts, tables (zero deps). |
| `@envy/react` | Thin React wrapper: `<Chart spec={...} />`. |
| `@envy/gallery` (app) | Vite gallery + harness for visual iteration. |

## Quick start (declarative spec)

```ts
import { render } from '@envy/core';

const chart = render(document.getElementById('app')!, {
  type: 'line',
  data: [
    { date: '2024-01', sales: 120 },
    { date: '2024-02', sales: 180 },
    { date: '2024-03', sales: 150 },
  ],
  encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'sales', type: 'quantitative' } },
});

chart.update({ /* new spec */ });
chart.destroy();
```

## Design principles

- **Agent-first API** — one chart = one JSON-serializable `ChartSpec`.
- **Hybrid rendering** — Canvas2D for data marks, DOM/SVG overlay for crisp text & a11y.
- **From scratch** — scales, color, shapes, ticks, and the pivot engine are hand-written.
- **Stunning by default** — flat, modern themes (light/dark), accessible palettes.
- **Fast at scale** — decimation, layered redraw, virtualized tables for 100k+ rows.

## Development

```bash
npm install
npm run build       # build all packages
npm test            # run unit tests
npm run gallery     # launch the Vite gallery harness
```

This is a monorepo managed with npm workspaces. See `plan.md` (session) for the roadmap.
