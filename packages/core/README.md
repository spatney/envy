# @envy/core

> The framework-agnostic, **zero-dependency** engine behind [Envy](https://github.com/spatney/envy) —
> a beautiful, high-performance, **agent-first** data visualization library.

One chart is one JSON object. Hand the engine a declarative, JSON-serializable
`ChartSpec` and it renders Tableau-class visuals with a tiny hybrid Canvas2D + DOM core —
scales, ticks, color, shapes, the pivot engine, and the renderer are all hand-written
(no D3/charting dependencies).

```bash
npm install @envy/core
```

```ts
import { render, type ChartSpec } from '@envy/core';

const spec: ChartSpec = {
  type: 'line',
  title: 'Monthly active users',
  data: [
    { month: '2024-01', users: 4200 },
    { month: '2024-02', users: 4650 },
    { month: '2024-03', users: 5010 },
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'users', type: 'quantitative', format: ',d' },
  },
};

const chart = render('#app', spec);
chart.update(nextSpec); // new data/config (animated)
chart.resize();         // re-measure after a layout change
chart.destroy();        // tear down
```

## Chart types

`line` · `area` · `bar` · `scatter` · `pie`/donut · `heatmap` · `kpi` · `table` ·
`matrix` (pivot) · `box` (box-and-whisker) · `sankey` · `choropleth`.

## Validation

```ts
import { validateSpec } from '@envy/core';

const { valid, errors, warnings } = validateSpec(spec);
```

## Documentation

- [Agent Guide](https://github.com/spatney/envy/blob/main/docs/agent-guide.md)
- [Spec Reference](https://github.com/spatney/envy/blob/main/docs/spec-reference.md)
- [JSON Schema](https://github.com/spatney/envy/blob/main/docs/chart-spec.schema.json)
- [Examples](https://github.com/spatney/envy/tree/main/docs/examples)

MIT © Sachin Patney
