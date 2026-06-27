# @graphein/react

> The React wrapper for [Graphein](https://github.com/spatney/graphein) — a beautiful,
> high-performance, **agent-first** data visualization library.

Install alongside `react` (18+, a peer dependency):

```bash
npm install @graphein/react react
```

```tsx
import { Chart } from '@graphein/react';
import type { ChartSpec } from 'graphein';

const spec: ChartSpec = {
  type: 'bar',
  data: [
    { quarter: 'Q1', revenue: 240 },
    { quarter: 'Q2', revenue: 310 },
    { quarter: 'Q3', revenue: 280 },
    { quarter: 'Q4', revenue: 360 },
  ],
  encoding: { x: { field: 'quarter' }, y: { field: 'revenue' } },
};

export function Dashboard() {
  return (
    <div style={{ height: 360 }}>
      <Chart spec={spec} />
    </div>
  );
}
```

`<Chart spec={…} />` renders into a fill-by-default container; pass a new `spec`
to update in place, and it tears down on unmount. For headless control over your
own element, use the `useChart(spec)` hook (returns a ref to attach).

## Documentation

- [README](https://github.com/spatney/graphein#readme)
- [Agent Guide](https://github.com/spatney/graphein/blob/main/docs/agent-guide.md)
- [Spec Reference](https://github.com/spatney/graphein/blob/main/docs/spec-reference.md)

MIT © Sachin Patney
