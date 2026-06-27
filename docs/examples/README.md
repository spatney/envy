# Graphein example specs

Each file is a complete, runnable [`ChartSpec`](../spec-reference.md) (or
[`DashboardSpec`](../spec-reference.md#dashboards)) with small inline data. Drop one
into `render()` — or `renderDashboard()` for the dashboard example:

```ts
import { render, renderDashboard } from 'graphein';
import line from 'graphein/docs/examples/line.json';
import dashboard from 'graphein/docs/examples/dashboard.json';
render('#app', line);
renderDashboard('#app', dashboard);
```

| File | Type |
| --- | --- |
| [line.json](./line.json) | line |
| [area-stacked.json](./area-stacked.json) | area (stacked) |
| [bar-grouped.json](./bar-grouped.json) | bar (grouped) |
| [scatter.json](./scatter.json) | scatter (bubble) |
| [pie-donut.json](./pie-donut.json) | pie (donut) |
| [donut-callouts.json](./donut-callouts.json) | pie (donut) + outside callout labels |
| [funnel.json](./funnel.json) | funnel (conversion) |
| [heatmap.json](./heatmap.json) | heatmap |
| [kpi.json](./kpi.json) | kpi |
| [table.json](./table.json) | table |
| [rich-table.json](./rich-table.json) | table + conditional formatting + totals |
| [matrix.json](./matrix.json) | matrix |
| [pivot-matrix.json](./pivot-matrix.json) | matrix (pivot) + show-as % + heatmap |
| [box.json](./box.json) | box (distribution) |
| [sankey.json](./sankey.json) | sankey (flow) |
| [choropleth.json](./choropleth.json) | choropleth (map) |
| [bar-sketch.json](./bar-sketch.json) | bar + hand-drawn `sketch` mode |
| [slicer-dropdown.json](./slicer-dropdown.json) | dropdown slicer |
| [dashboard.json](./dashboard.json) | dashboard (auto cross-filter + highlight) |
| [dashboard-sections.json](./dashboard-sections.json) | dashboard (sections + cards + responsive) |

All examples are validated against [`../chart-spec.schema.json`](../chart-spec.schema.json).
