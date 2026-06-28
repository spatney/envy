# @graphein/node

> Headless [Graphein](https://github.com/spatney/graphein) rendering for Node — turn any
> `ChartSpec` into a **PNG buffer plus a machine-readable render report**, with no browser
> and no JSDOM.

This is the server-side half of Graphein's agent feedback loop. The same model build and
mark renderers that run in the browser run here, so an agent (or a CI job, or a report
emailer) can **generate → validate → render → critique** a chart entirely on the server.

```bash
npm install @graphein/node graphein
```

```ts
import { renderChart } from '@graphein/node';
import { writeFileSync } from 'node:fs';

const { png, report } = renderChart(
  {
    type: 'combo',
    title: 'Revenue vs. conversion',
    data: [
      { month: 'Jan', revenue: 120, conversion: 0.041 },
      { month: 'Feb', revenue: 145, conversion: 0.046 },
      { month: 'Mar', revenue: 138, conversion: 0.044 },
    ],
    encoding: { x: { field: 'month' } },
    layers: [
      { mark: 'bar', encoding: { y: { field: 'revenue', title: 'Revenue ($k)' } } },
      { mark: 'line', axis: 'right', encoding: { y: { field: 'conversion', format: '.1%' } } },
    ],
  },
  { width: 900, height: 480, dpr: 2 },
);

if (!report.ok) console.warn('chart has issues:', report.diagnostics);
writeFileSync('chart.png', png);
```

## Why it exists

Text in Graphein (axis labels, titles, legends, annotations) is normally laid out as a
crisp HTML overlay. Headless rendering can't use the DOM, so `@graphein/node` drives
core's dependency-free `renderToContext` — which paints that same text **onto the canvas**
at the exact computed positions — and wires it to [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas)
for fast, native PNG output. The core `graphein` engine stays **zero-dependency**; the
native bits live only in this package.

## API

### `renderChart(spec, options?) → { png, report, width, height }`

Renders `spec` and returns the PNG bytes **and** the [`RenderReport`](https://github.com/spatney/graphein/blob/main/docs/spec-reference.md#render-report)
— `ok`, mark/series/color counts, and any clipping / overlap / contrast diagnostics. The
report is computed from the resolved model (no pixel read-back), so it's identical to
`instance.report()` in the browser. This is what lets an agent verify a chart **without a
vision model**.

### `renderToPNG(spec, options?) → Buffer`

Convenience wrapper that returns only the PNG bytes.

### Options

| Option   | Default | Description                                                            |
| -------- | ------- | --------------------------------------------------------------------- |
| `width`  | `800`   | Logical width in CSS pixels.                                          |
| `height` | `500`   | Logical height in CSS pixels.                                         |
| `dpr`    | `2`     | Device pixel ratio — the PNG is rasterized at `width*dpr × height*dpr`. |
| `fonts`  | —       | `{ path, family }[]` font files to register before rendering.         |

### Fonts

`@napi-rs/canvas` uses system fonts by default. For pixel-perfect parity with the browser
(Graphein's default family is **Inter**), register a font file:

```ts
renderChart(spec, {
  fonts: [{ path: '/fonts/Inter-Variable.ttf', family: 'Inter' }],
});
```

`GlobalFonts` is re-exported if you prefer to register fonts once at startup.

## Supported charts

Every canvas-backed type: **line, area, bar, scatter, box, pie, heatmap, sankey,
choropleth, combo, histogram, funnel**. DOM-only visuals (`kpi`, `table`, `matrix`,
slicers, `dashboard`) are HTML — they have no canvas form and throw a clear error.

## License

MIT
