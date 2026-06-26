# @envy/react

> The React wrapper for [Envy](https://github.com/spatney/envy) — a beautiful,
> high-performance, **agent-first** data visualization library.

```bash
npm install @envy/react @envy/core react
```

`@envy/core` is a dependency (installed automatically); `react` (18+) is a peer
dependency.

```tsx
import { Chart } from '@envy/react';
import type { ChartSpec } from '@envy/core';

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

- [README](https://github.com/spatney/envy#readme)
- [Agent Guide](https://github.com/spatney/envy/blob/main/docs/agent-guide.md)
- [Spec Reference](https://github.com/spatney/envy/blob/main/docs/spec-reference.md)

MIT © Sachin Patney
