# Envy example specs

Each file is a complete, runnable [`ChartSpec`](../spec-reference.md) with small inline
data. Drop one into `render()`:

```ts
import { render } from '@envy/core';
import spec from 'envy/docs/examples/line.json';
render('#app', spec);
```

| File | Type |
| --- | --- |
| [line.json](./line.json) | line |
| [area-stacked.json](./area-stacked.json) | area (stacked) |
| [bar-grouped.json](./bar-grouped.json) | bar (grouped) |
| [scatter.json](./scatter.json) | scatter (bubble) |
| [pie-donut.json](./pie-donut.json) | pie (donut) |
| [heatmap.json](./heatmap.json) | heatmap |
| [kpi.json](./kpi.json) | kpi |
| [table.json](./table.json) | table |
| [matrix.json](./matrix.json) | matrix |
| [box.json](./box.json) | box (distribution) |
| [sankey.json](./sankey.json) | sankey (flow) |
| [choropleth.json](./choropleth.json) | choropleth (map) |

All examples are validated against [`../chart-spec.schema.json`](../chart-spec.schema.json).
