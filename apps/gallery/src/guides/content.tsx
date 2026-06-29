import type { ReactNode } from 'react';
import type { ChartSpec, DashboardSpec } from 'graphein';
import { ChartStage } from '../components/chart/ChartStage';
import { InlineTryIt } from '../components/guide/InlineTryIt';
import { Lead, P, H, C, Snippet, List } from '../components/learn/prose';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Callout, Chip, SectionHeader, SpectrumBar } from '../components/ui/primitives';

const salesRows = [
  { month: '2024-01', region: 'West', product: 'Core', sales: 120, margin: 0.31, orders: 38 },
  { month: '2024-01', region: 'East', product: 'Core', sales: 96, margin: 0.28, orders: 31 },
  { month: '2024-02', region: 'West', product: 'Core', sales: 132, margin: 0.33, orders: 41 },
  { month: '2024-02', region: 'East', product: 'Core', sales: 104, margin: 0.29, orders: 34 },
  { month: '2024-03', region: 'West', product: 'Core', sales: 141, margin: 0.34, orders: 45 },
  { month: '2024-03', region: 'East', product: 'Core', sales: 118, margin: 0.3, orders: 36 },
  { month: '2024-04', region: 'West', product: 'Core', sales: 150, margin: 0.36, orders: 48 },
  { month: '2024-04', region: 'East', product: 'Core', sales: 126, margin: 0.32, orders: 39 },
  { month: '2024-05', region: 'West', product: 'Core', sales: 158, margin: 0.35, orders: 51 },
  { month: '2024-05', region: 'East', product: 'Core', sales: 140, margin: 0.34, orders: 43 },
  { month: '2024-06', region: 'West', product: 'Core', sales: 171, margin: 0.37, orders: 55 },
  { month: '2024-06', region: 'East', product: 'Core', sales: 149, margin: 0.35, orders: 47 },
];

const regionRows = [
  { region: 'West', sales: 872, target: 820, margin: 0.35 },
  { region: 'East', sales: 733, target: 760, margin: 0.31 },
  { region: 'Central', sales: 642, target: 610, margin: 0.29 },
  { region: 'South', sales: 588, target: 640, margin: 0.27 },
];

const wideRows = [
  { month: '2024-01', West: 120, East: 96, Central: 88 },
  { month: '2024-02', West: 132, East: 104, Central: 93 },
  { month: '2024-03', West: 141, East: 118, Central: 101 },
  { month: '2024-04', West: 150, East: 126, Central: 108 },
  { month: '2024-05', West: 158, East: 140, Central: 116 },
  { month: '2024-06', West: 171, East: 149, Central: 127 },
];

const facetRows = ['West', 'East', 'Central', 'South'].flatMap((region, ri) =>
  ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05', '2024-06'].map((month, mi) => ({
    month,
    region,
    sales: 80 + ri * 18 + mi * (8 + ri) + (mi === 3 && region === 'South' ? -18 : 0),
  })),
);

const performanceRows = Array.from({ length: 96 }, (_, i) => ({
  minute: `2024-06-01T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00`,
  latency: Math.round(180 + Math.sin(i / 5) * 24 + (i % 17 === 0 ? 42 : 0) + i * 0.35),
}));

const coreSpec = {
  type: 'line',
  title: { text: 'Monthly sales by region', subtitle: 'A tidy table plus x/y/series encodings' },
  data: salesRows,
  encoding: {
    x: { field: 'month', type: 'temporal', title: 'Month' },
    y: { field: 'sales', type: 'quantitative', title: 'Sales', format: ',d' },
    series: { field: 'region', type: 'nominal' },
  },
  points: true,
} as unknown as ChartSpec;

const transformSpec = {
  type: 'bar',
  title: 'Sales after filter + aggregate transform',
  data: salesRows,
  transform: [
    { filter: { field: 'sales', gt: 100 } },
    { aggregate: [{ op: 'sum', field: 'sales', as: 'sales' }], groupby: ['region'] },
    { calculate: "sales >= 800 ? 'Above plan' : 'Watch'", as: 'status' },
  ],
  encoding: {
    x: { field: 'region', type: 'nominal' },
    y: { field: 'sales', type: 'quantitative', format: ',d' },
    series: { field: 'status', type: 'nominal' },
  },
  cornerRadius: 6,
} as ChartSpec;

const foldSpec = {
  type: 'line',
  title: 'Fold turns wide columns into a series channel',
  data: wideRows,
  transform: [{ fold: ['West', 'East', 'Central'], as: ['region', 'sales'] }],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'sales', type: 'quantitative' },
    series: { field: 'region', type: 'nominal' },
  },
} as unknown as ChartSpec;

const formattingSpec = {
  type: 'bar',
  title: { text: 'Regional attainment', subtitle: 'Formats, axis titles, legend placement, and a theme override' },
  data: regionRows.map((row) => ({ ...row, attainment: row.sales / row.target })),
  encoding: {
    x: { field: 'region', type: 'nominal', title: 'Region' },
    y: { field: 'attainment', type: 'quantitative', title: 'Sales / target', format: '.0%' },
    series: { field: 'region', type: 'nominal' },
  },
  axes: { y: { grid: true, format: '.0%' } },
  legend: { position: 'bottom', title: 'Region' },
  theme: { base: 'light', color: { accent: '#0d9488', palette: ['#0d9488', '#2563eb', '#9333ea', '#f97316'] } },
  cornerRadius: 8,
} as unknown as ChartSpec;

const annotationSpec = {
  type: 'line',
  title: 'Latency with SLA and release callouts',
  data: performanceRows.slice(0, 32),
  encoding: {
    x: { field: 'minute', type: 'temporal', title: 'Time' },
    y: { field: 'latency', type: 'quantitative', title: 'Latency (ms)' },
  },
  annotations: [
    { type: 'line', value: 220, label: 'SLA', color: '#ef4444' },
    { type: 'band', from: 160, to: 200, label: 'Healthy band', color: '#14b8a6' },
    { type: 'point', x: '2024-06-01T04:00:00', y: 235, label: 'Deploy spike', color: '#f97316' },
  ],
  insights: true,
} as ChartSpec;

const trendSpec = {
  type: 'scatter',
  title: 'Orders vs. sales with a derived trendline',
  data: salesRows,
  encoding: {
    x: { field: 'orders', type: 'quantitative', title: 'Orders' },
    y: { field: 'sales', type: 'quantitative', title: 'Sales' },
    series: { field: 'region', type: 'nominal' },
  },
  trendline: { label: true },
} as ChartSpec;

const facetSpec = {
  type: 'line',
  title: 'Same scale in every region panel',
  data: facetRows,
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'sales', type: 'quantitative' },
  },
  facet: { field: 'region', columns: 2 },
  points: true,
} as ChartSpec;

const interactivitySpec = {
  type: 'dashboard',
  title: 'Selection-driven region view',
  subtitle: 'The dropdown publishes region; the chart and KPI consume it as a filter.',
  data: salesRows,
  layout: { cols: 12, density: 'compact', maxWidth: 980, sections: [{ title: 'Linked views', views: ['region', 'total', 'trend'] }] },
  views: [
    { id: 'region', title: 'Region filter', spec: { type: 'dropdown', field: 'region', multiple: true }, w: 3, h: 2 },
    {
      id: 'total',
      title: 'Filtered sales',
      accent: '#14b8a6',
      spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' }, label: 'Sales', format: ',d', sparkline: { field: 'sales' } },
      w: 3,
      h: 2,
    },
    {
      id: 'trend',
      title: 'Trend',
      spec: {
        type: 'line',
        encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'sales' }, series: { field: 'region' } },
        filter: [{ param: 'region' }],
      },
      w: 6,
      h: 3,
    },
  ],
  interactions: 'auto',
} as DashboardSpec;

const dashboardSpec = {
  type: 'dashboard',
  title: 'Revenue control room',
  subtitle: 'A page made from one dataset, four views, and automatic interactions.',
  data: salesRows,
  layout: {
    cols: 12,
    density: 'standard',
    maxWidth: 1100,
    sections: [
      { id: 'filters', title: 'Filters', views: ['region', 'month'] },
      { id: 'performance', title: 'Performance', views: ['sales', 'trend', 'table'] },
    ],
  },
  views: [
    { id: 'region', title: 'Region', spec: { type: 'list', field: 'region' }, w: 4, h: 2 },
    { id: 'month', title: 'Month range', spec: { type: 'dateRange', field: 'month', format: '%b %Y' }, w: 8, h: 2 },
    { id: 'sales', title: 'Sales', accent: '#14b8a6', spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' }, label: 'Sales', format: ',d' }, w: 3, h: 2 },
    {
      id: 'trend',
      title: 'Sales trend',
      spec: { type: 'line', encoding: { x: { field: 'month', type: 'temporal' }, y: { field: 'sales' }, series: { field: 'region' } } },
      w: 5,
      h: 3,
    },
    {
      id: 'table',
      title: 'Detail',
      spec: {
        type: 'table',
        columns: [
          { field: 'month', title: 'Month', type: 'temporal', format: '%b %Y' },
          { field: 'region' },
          { field: 'sales', type: 'quantitative', format: ',d', conditionalFormat: { type: 'bar', color: '#14b8a6' } },
          { field: 'margin', type: 'quantitative', format: '.0%' },
        ],
        density: 'compact',
      },
      w: 4,
      h: 3,
    },
  ],
  interactions: 'auto',
} as DashboardSpec;

const agentLoopSpec = {
  type: 'bar',
  title: 'Repairable spec example',
  data: regionRows,
  encoding: { x: { field: 'region', type: 'nominal' }, y: { field: 'sales', type: 'quantitative' } },
  insights: true,
} as ChartSpec;

const sketchSpec = {
  type: 'pie',
  title: 'Pipeline share in sketch mode',
  data: [
    { stage: 'Qualified', accounts: 48 },
    { stage: 'Demo', accounts: 31 },
    { stage: 'Proposal', accounts: 18 },
    { stage: 'Closed', accounts: 9 },
  ],
  encoding: { theta: { field: 'accounts' }, color: { field: 'stage' } },
  donut: 0.55,
  labels: { placement: 'auto', content: 'category-percent' },
  sketch: { roughness: 1.4, fillStyle: 'hachure', seed: 7 },
  theme: { base: 'light', color: { palette: ['#14b8a6', '#2563eb', '#9333ea', '#f97316'] } },
} as unknown as ChartSpec;

const performanceSpec = {
  type: 'line',
  title: 'Ninety-six latency points',
  data: performanceRows,
  encoding: {
    x: { field: 'minute', type: 'temporal', title: 'Time' },
    y: { field: 'latency', type: 'quantitative', title: 'Latency (ms)' },
  },
  animation: false,
  annotations: [{ type: 'line', value: 240, label: 'Investigate', color: '#ef4444' }],
} as ChartSpec;

const accessibilitySpec = {
  type: 'bar',
  title: 'Readable comparison with explicit alt text',
  description: 'Bar chart comparing regional sales attainment. West and Central beat target; East and South are below target.',
  data: regionRows.map((row) => ({ region: row.region, attainment: row.sales / row.target })),
  encoding: {
    x: { field: 'region', type: 'nominal', title: 'Region' },
    y: { field: 'attainment', type: 'quantitative', title: 'Attainment', format: '.0%' },
  },
  axes: { y: { format: '.0%', grid: true } },
  annotations: [{ type: 'line', value: 1, label: 'Target', color: '#0f766e' }],
  insights: true,
} as ChartSpec;

function GuidePage({ children }: { children: ReactNode }) {
  return <div className="space-y-8">{children}</div>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <H>{title}</H>
      {children}
    </section>
  );
}

function Try({ spec, title, height }: { spec: ChartSpec | DashboardSpec; title: string; height?: number }) {
  return <InlineTryIt spec={spec} title={title} height={height} />;
}

export const guideContent: Record<string, ReactNode> = {
  'core-concepts': (
    <GuidePage>
      <Lead>Start with one ChartSpec. Graphein builds scales, axes, marks, legends, labels, summaries, and RenderReport diagnostics from fields in that object.</Lead>
      <Section title="The minimum useful shape">
        <P>
          A cartesian chart needs <C>type</C>, tidy row-oriented <C>data</C>, and an <C>encoding</C> that maps columns to channels: one observation per row, one variable per column.
        </P>
        <List
          items={[
            <>Use <C>x</C> and <C>y</C> for position.</>,
            <>Use <C>series</C> to split groups without pre-pivoting.</>,
            <>Use field <C>type</C> when inference might be ambiguous, especially dates.</>,
          ]}
        />
      </Section>
      <Try spec={coreSpec} title="Edit a complete ChartSpec" height={430} />
      <Section title="Runtime loop">
        <P>
          Validate first, render second, inspect the report third. The render → report loop tells an agent whether output is blank, clipped, or crowded.
        </P>
        <Snippet
          title="validate → render → report"
          lang="ts"
          code={`import { validateSpec, render } from 'graphein';\n\nconst result = validateSpec(spec);\nif (!result.valid) throw new Error(result.errors[0].message);\n\nconst chart = render('#app', spec);\nconst report = chart.report();\nchart.update(nextSpec);`}
        />
      </Section>
      <ChartStage spec={coreSpec} height={320} />
    </GuidePage>
  ),

  'data-transforms': (
    <GuidePage>
      <Lead>Transforms reshape rows inside the ChartSpec. They run in order before render, so encodings can point at fields the pipeline creates.</Lead>
      <Section title="Use Transforms Instead of Hand-Shaped Arrays">
        <P>
          A transform step carries exactly one operator key: <C>aggregate</C>, <C>filter</C>, <C>bin</C>, <C>fold</C>, <C>timeUnit</C>, or <C>calculate</C>. The input data is never mutated.
        </P>
        <CodeBlock
          title="transform operators"
          lang="json"
          code={`[\n  { "filter": { "field": "sales", "gt": 100 } },\n  { "aggregate": [{ "op": "sum", "field": "sales", "as": "sales" }], "groupby": ["region"] },\n  { "calculate": "round(sales / 1000, 1)", "as": "salesK" }\n]`}
        />
      </Section>
      <Try spec={transformSpec} title="Filter, aggregate, and calculate" height={430} />
      <Section title="Wide to tidy">
        <P>
          <C>fold</C> repeats each input row once per folded column. That turns <C>West</C>, <C>East</C>, and <C>Central</C> columns into <C>region</C> + <C>sales</C> rows that a <C>series</C> channel can use.
        </P>
        <Try spec={foldSpec} title="Fold wide columns into a line series" height={390} />
      </Section>
    </GuidePage>
  ),

  formatting: (
    <GuidePage>
      <Lead>Formatting lives in the ChartSpec with the analysis. Axis labels, legends, number formats, titles, and color tokens are explicit and reviewable.</Lead>
      <Section title="Format at the Field Boundary">
        <P>
          Put number and date hints on the field that owns the value. Graphein uses the same hint for ticks, labels, tooltips, table cells, and summaries where applicable.
        </P>
        <List
          items={[
            <><C>,d</C> for grouped integers.</>,
            <><C>$,.0f</C> for rounded currency.</>,
            <><C>.0%</C> for proportions stored as 0–1 values.</>,
            <><C>%b %Y</C> for dates like Jun 2024.</>,
          ]}
        />
      </Section>
      <Try spec={formattingSpec} title="Tune titles, axes, legend, format, and palette" height={430} />
      <Section title="Theme Overrides Are Partial">
        <P>
          Use <C>theme: 'dark'</C>, <C>theme: 'light'</C>, or a partial override with <C>base</C>. You can replace only an accent, a palette, or a text token without redefining the full theme.
        </P>
        <Snippet
          title="partial theme override"
          code={`{\n  "theme": {\n    "base": "light",\n    "color": { "accent": "#0d9488", "palette": ["#0d9488", "#2563eb"] }\n  }\n}`}
        />
      </Section>
    </GuidePage>
  ),

  annotations: (
    <GuidePage>
      <Lead>Annotations are declarative overlays for thresholds, bands, launches, notable points, and derived max/min callouts.</Lead>
      <Section title="Reference Lines, Bands, and Points">
        <P>
          Cartesian charts accept <C>annotations</C>. A line needs <C>value</C>; a band needs <C>from</C> and <C>to</C>; a point needs <C>x</C> and <C>y</C>. Set <C>axis:'x'</C> for vertical references.
        </P>
        <CodeBlock
          title="annotation shapes"
          lang="json"
          code={`[\n  { "type": "line", "value": 220, "label": "SLA" },\n  { "type": "band", "from": 160, "to": 200, "label": "Healthy" },\n  { "type": "point", "x": "2024-06-01T04:00:00", "y": 235, "label": "Deploy spike" }\n]`}
        />
      </Section>
      <Try spec={annotationSpec} title="Edit annotation overlays" height={430} />
      <Section title="Derived Callouts">
        <P>
          <C>insights:true</C> marks max and min points for a single-series line, area, or bar. <C>trendline:true</C> adds an ordinary-least-squares fit to line, area, or scatter charts.
        </P>
        <Try spec={trendSpec} title="Trendline per series with R² labels" height={390} />
      </Section>
    </GuidePage>
  ),

  faceting: (
    <GuidePage>
      <Lead>Faceting creates small multiples from one field. Keep one dataset and one ChartSpec; Graphein splits it into panels with shared scales.</Lead>
      <Section title="Do Not Emit One Chart per Group">
        <P>
          Set <C>facet:{'{'} field, columns? {'}'}</C> on a <C>line</C>, <C>area</C>, <C>bar</C>, or <C>scatter</C>. Each panel reuses the global domains, so a high value in one panel is visually comparable to a high value in another.
        </P>
      </Section>
      <Try spec={facetSpec} title="Change facet columns or panel field" height={470} />
      <Section title="When to facet">
        <List
          items={[
            <>Use a shared axis when you want direct comparison across panels.</>,
            <>Keep color for a second grouping variable, not for the facet field itself.</>,
            <>Facet static comparisons; use slicers or dashboards when the reader needs filtering.</>,
          ]}
        />
      </Section>
    </GuidePage>
  ),

  interactivity: (
    <GuidePage>
      <Lead>Selections are data. A visual publishes a named selection; other visuals consume it as a filter or highlight without callbacks in the spec.</Lead>
      <Section title="Publish and consume">
        <P>
          Use <C>params</C> for chart clicks and brushes. Use slicers — <C>dropdown</C>, <C>list</C>, <C>search</C>, <C>range</C>, and <C>dateRange</C> — when you want controls that publish the selection.
        </P>
        <Snippet
          title="selection wiring"
          code={`{\n  "params": [{ "name": "picked", "select": { "type": "point", "fields": ["region"] } }],\n  "highlight": { "param": "picked" },\n  "filter": [{ "param": "region" }]\n}`}
        />
      </Section>
      <Try spec={interactivitySpec} title="Dashboard with a dropdown-driven filter" height={500} />
      <Section title="Standalone Charts Can Share a Store">
        <P>
          Outside a dashboard, pass the same <C>createSelectionStore()</C> to separate <C>render()</C> calls. The specs still stay JSON-only; the store is runtime plumbing.
        </P>
        <Snippet
          title="shared selection store"
          lang="ts"
          code={`const store = createSelectionStore();\nrender('#source', sourceSpec, { store });\nrender('#target', targetSpec, { store });`}
        />
      </Section>
    </GuidePage>
  ),

  dashboards: (
    <GuidePage>
      <Lead>A dashboard is one JSON page: shared data, placed views, layout sections, and a selection store owned by the dashboard instance.</Lead>
      <Section title="Compose Views, Not Components">
        <P>
          Each view has a stable <C>id</C>, a chart or slicer <C>spec</C>, and optional card chrome. Views without their own <C>data</C> inherit the dashboard data.
        </P>
        <List
          items={[
            <><C>layout.sections</C> groups cards into labeled bands.</>,
            <><C>w</C> and <C>h</C> set grid spans; <C>responsive</C> can override them.</>,
            <><C>interactions:'auto'</C> lets slicers filter matching views and chart clicks cross-filter the page.</>,
          ]}
        />
      </Section>
      <Try spec={dashboardSpec} title="Edit a full dashboard spec" height={560} />
      <Section title="When to Use Explicit Links">
        <P>
          Replace <C>interactions:'auto'</C> with an array when you need a precise policy, such as one source filtering a table but only highlighting a trend.
        </P>
        <CodeBlock
          title="explicit dashboard links"
          code={`"interactions": [\n  { "source": "region", "target": "*", "as": "filter" },\n  { "source": "trend", "target": ["table"], "as": "highlight", "fields": ["month"] }\n]`}
          lang="json"
        />
      </Section>
    </GuidePage>
  ),

  'agent-loop': (
    <GuidePage>
      <Lead>Graphein is built for the render → report loop: generate JSON, validate it, repair safe mistakes, render it, then read RenderReport diagnostics.</Lead>
      <Section title="Validation Is Pure">
        <P>
          <C>validateSpec(spec)</C> returns structural errors and lint warnings without touching the DOM. Errors may include JSON Patch <C>fix</C> operations and suggestions.
        </P>
        <Snippet
          title="repair only safe fixes"
          lang="ts"
          code={`import { validateSpec, repairSpec } from 'graphein';\n\nconst result = validateSpec(spec);\nif (!result.valid) {\n  const repaired = repairSpec(spec);\n  spec = repaired.spec;\n}`}
        />
      </Section>
      <Try spec={agentLoopSpec} title="Make a safe edit, then watch validation" height={400} />
      <Section title="Report Closes the Loop">
        <P>
          <C>chart.report()</C> returns <C>ok</C>, mark count, series count, diagnostics like clipped marks or low contrast, and the same deterministic summary used for alt text.
        </P>
        <Callout title="Agent rule">
          Treat warnings as review items. A warning may be acceptable, but the agent should know why it is choosing to keep it.
        </Callout>
      </Section>
    </GuidePage>
  ),

  'themes-sketch': (
    <GuidePage>
      <Lead>Themes and sketch mode change presentation without changing row shape. Generated ChartSpecs stay stable across dashboards and exploratory notes.</Lead>
      <Section title="Theme tokens">
        <P>
          Override only what you need: <C>color.background</C>, <C>surface</C>, <C>text</C>, <C>accent</C>, <C>palette</C>, <C>positive</C>, and <C>negative</C> are all tokenized.
        </P>
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex flex-wrap gap-2">
            <Chip tone="accent">accent</Chip>
            <Chip>palette[]</Chip>
            <Chip>surface</Chip>
            <Chip>textMuted</Chip>
          </div>
          <SpectrumBar />
        </div>
      </Section>
      <Try spec={sketchSpec} title="Tune sketch and theme fields" height={430} />
      <Section title="Sketch Is Deterministic">
        <P>
          <C>sketch:true</C> uses defaults. A config object controls roughness, bowing, hachure fill, stroke width, font, and seed. The same spec renders the same sketch, which keeps screenshots stable.
        </P>
      </Section>
    </GuidePage>
  ),

  performance: (
    <GuidePage>
      <Lead>Performance choices are mostly ChartSpec choices: send tidy rows, aggregate to the question's grain, and avoid overplotting when a summary answers the question.</Lead>
      <Section title="Built-in Fast Paths">
        <List
          items={[
            <>Large line and area charts use LTTB decimation to draw about one point per pixel while keeping full data for hit testing.</>,
            <>Tables and matrices virtualize rows.</>,
            <>Hover paints an interaction layer instead of redrawing the marks layer.</>,
            <>Set <C>animation:false</C> for automation or dashboards that update frequently.</>,
          ]}
        />
      </Section>
      <Try spec={performanceSpec} title="Inspect a denser line spec" height={430} />
      <Section title="Prefer Pipeline Summaries">
        <P>
          If the question is per day, month, or category, aggregate in <C>transform</C> before plotting. That makes the rendered mark count match the analytical grain.
        </P>
        <CodeBlock
          title="timeUnit + aggregate"
          lang="json"
          code={`[\n  { "timeUnit": "month", "field": "timestamp", "as": "month" },\n  { "aggregate": [{ "op": "mean", "field": "latency", "as": "latency" }], "groupby": ["month"] }\n]`}
        />
      </Section>
    </GuidePage>
  ),

  accessibility: (
    <GuidePage>
      <Lead>Accessible output is part of the render contract: Graphein wraps charts as figures, emits alt text, exposes DOM labels, and mirrors canvas data for assistive technology.</Lead>
      <Section title="Describe the Chart">
        <P>
          Set <C>description</C> when you need precise alt text. If you omit it, Graphein synthesizes a description from the spec and attaches <C>summarize(spec)</C> to reports.
        </P>
        <List
          items={[
            <>Canvas layers are decorative and hidden from screen readers.</>,
            <>Canvas charts get a visually hidden table, capped for practicality.</>,
            <>Table and matrix charts render semantic tables with sortable headers.</>,
            <>Low-contrast text and marks appear as report diagnostics.</>,
          ]}
        />
      </Section>
      <Try spec={accessibilitySpec} title="Edit description, formats, and target line" height={430} />
      <Section title="Use Report Diagnostics">
        <P>
          The report can flag <C>low-contrast-text</C>, <C>low-contrast-mark</C>, <C>axis-label-overlap</C>, and <C>legend-overflow</C>. Fix those with theme colors, axis labels, fewer categories, or a dashboard layout change.
        </P>
        <SectionHeader eyebrow="Checklist" title="Before Release" lead="Validate the ChartSpec, render it, read the RenderReport, and verify the summary matches the chart's question." />
      </Section>
    </GuidePage>
  ),
};
