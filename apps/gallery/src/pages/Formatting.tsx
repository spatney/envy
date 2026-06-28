import type { ReactNode } from 'react';
import type { ChartSpec } from 'graphein';
import { ChartStage } from '../components/chart/ChartStage';
import { Page, PageHeader } from '../components/ui/Page';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Tabs } from '../components/ui/Tabs';
import { Callout, Card, Chip, Kicker } from '../components/ui/primitives';
import { scatter, salesTable, timeSeries } from '../content/data';

const sharedNumbers = [
  { label: 'Usage', value: 1234 },
  { label: 'Revenue', value: 56789 },
  { label: 'Audience', value: 1234567 },
];

const currencySpec: ChartSpec = {
  type: 'bar',
  data: sharedNumbers,
  encoding: {
    x: { field: 'label', title: 'Metric' },
    y: { field: 'value', title: 'Formatted as currency', format: '$,.0f' },
  },
  cornerRadius: 8,
  title: 'Currency hint: $,.0f',
  axes: { y: { ticks: 4 } },
  tooltip: true,
};

const percentSpec: ChartSpec = {
  type: 'bar',
  data: sharedNumbers,
  encoding: {
    x: { field: 'label', title: 'Same metric rows' },
    y: { field: 'value', title: 'Formatted as percent', format: '.1%' },
  },
  cornerRadius: 8,
  title: 'Percent hint: .1%',
  axes: { y: { ticks: 4 } },
  tooltip: true,
};

const siSpec: ChartSpec = {
  type: 'bar',
  data: sharedNumbers,
  encoding: {
    x: { field: 'label', title: 'Same metric rows' },
    y: { field: 'value', title: 'Formatted with SI suffixes', format: ',.2s' },
  },
  cornerRadius: 8,
  title: 'SI hint: ,.2s',
  axes: { y: { ticks: 4 } },
  tooltip: true,
};

const dateSeries = timeSeries({
  points: 30,
  start: new Date(2024, 0, 1),
  stepDays: 30,
  base: 6200,
  trend: 84,
  seasonAmp: 520,
  noise: 180,
  seed: 14,
  valueField: 'sessions',
});

const dateFormatSpec: ChartSpec = {
  type: 'line',
  data: dateSeries,
  encoding: {
    x: { field: 'date', type: 'temporal', title: 'Month', format: '%b %Y' },
    y: { field: 'sessions', title: 'Qualified sessions', format: ',.2s' },
  },
  curve: 'monotone',
  points: true,
  title: {
    text: 'Temporal formatting with %b %Y',
    subtitle: 'ISO strings and Date objects share the same strftime-style formatter',
  },
  axes: { x: { ticks: 6, format: '%b %Y' }, y: { ticks: 4 } },
  tooltip: true,
};

const tableRows = salesTable({ n: 36, seed: 208 });

const conditionalTableSpec: ChartSpec = {
  type: 'table',
  data: tableRows,
  title: 'Regional orders with conditional formatting',
  density: 'compact',
  totals: { label: 'Portfolio total' },
  sort: { field: 'sales', order: 'desc' },
  columns: [
    { field: 'order', title: 'Order', width: 110, sortable: false },
    { field: 'region', title: 'Region', width: 92 },
    { field: 'category', title: 'Category', width: 138 },
    {
      field: 'sales',
      title: 'Sales',
      type: 'quantitative',
      format: '$,.0f',
      width: 142,
      total: 'sum',
      conditionalFormat: { type: 'bar', color: 'var(--accent)', baseline: 'min', showValue: true },
    },
    {
      field: 'margin',
      title: 'Margin',
      type: 'quantitative',
      format: '.1%',
      width: 118,
      conditionalFormat: { type: 'colorScale', scheme: 'teal', domain: [0.08, 0.58], target: 'background' },
    },
    {
      field: 'units',
      title: 'Units',
      type: 'quantitative',
      width: 96,
      conditionalFormat: { type: 'icon', set: 'trafficLights', position: 'left' },
    },
    {
      field: 'profit',
      title: 'Profit',
      type: 'quantitative',
      format: '$,.0f',
      width: 118,
      total: 'sum',
      negativeStyle: 'parens-red',
      conditionalFormat: {
        type: 'rules',
        rules: [
          { when: 'lt', value: 90, color: 'var(--err)', weight: 'bold', icon: '⚠' },
          { when: 'gte', value: 300, color: 'var(--ok)', weight: 'bold', icon: '✓' },
        ],
      },
    },
  ],
};

const matrixSpec: ChartSpec = {
  type: 'matrix',
  data: tableRows,
  title: 'Category mix by region',
  rows: ['region'],
  columns: ['category'],
  density: 'standard',
  subtotals: false,
  grandTotals: true,
  values: [
    {
      field: 'sales',
      op: 'sum',
      label: 'Share of region',
      showAs: 'percentOfRow',
      conditionalFormat: { type: 'colorScale', scheme: 'teal', domain: [0, 0.65], target: 'background' },
    },
  ],
};

const annotationRows = timeSeries({
  points: 36,
  start: new Date(2024, 0, 1),
  stepDays: 30,
  base: 112,
  trend: 1.9,
  seasonAmp: 18,
  noise: 7,
  seed: 83,
});

const annotationSpec: ChartSpec = {
  type: 'line',
  data: annotationRows,
  encoding: {
    x: { field: 'date', type: 'temporal', title: 'Month', format: '%b %Y' },
    y: { field: 'value', title: 'Activation index', format: ',.0f' },
  },
  curve: 'monotone',
  points: true,
  title: 'Targets, operating bands, and threshold zones',
  annotations: [
    { value: 168, label: 'Board target', strokeDash: [], strokeWidth: 2.5 },
    { type: 'band', from: 138, to: 158, label: 'Operating plan', labelPosition: 'middle', fillOpacity: 0.14 },
    { type: 'zone', from: 0, to: 104, label: 'Watch zone', labelPosition: 'start', fillOpacity: 0.1 },
  ],
  axes: { x: { ticks: 6, format: '%b %Y' }, y: { ticks: 5 } },
  tooltip: true,
};

const insightRows = [
  { month: '2026-01', value: 82 },
  { month: '2026-02', value: 86 },
  { month: '2026-03', value: 91 },
  { month: '2026-04', value: 74 },
  { month: '2026-05', value: 98 },
  { month: '2026-06', value: 106 },
  { month: '2026-07', value: 158 },
  { month: '2026-08', value: 112 },
  { month: '2026-09', value: 118 },
  { month: '2026-10', value: 126 },
  { month: '2026-11', value: 121 },
  { month: '2026-12', value: 132 },
];

const insightBaseSpec: ChartSpec = {
  type: 'line',
  data: insightRows,
  encoding: {
    x: { field: 'month', type: 'temporal', title: 'Month', format: '%b' },
    y: { field: 'value', title: 'Retention index', format: ',.0f' },
  },
  curve: 'monotone',
  points: true,
  title: 'Before: unlabeled movement',
  axes: { x: { ticks: 6, format: '%b' }, y: { ticks: 4 } },
  tooltip: true,
};

const insightSpec: ChartSpec = {
  ...insightBaseSpec,
  title: 'After: auto max/min + outlier labels',
  insights: { outliers: true },
};

const trendScatterSpec: ChartSpec = {
  type: 'scatter',
  data: scatter({ n: 90, groups: ['Enterprise', 'Self-serve'], seed: 504 }),
  encoding: {
    x: { field: 'x', title: 'Onboarding score', type: 'quantitative', format: ',.0f' },
    y: { field: 'y', title: 'Expansion likelihood', type: 'quantitative', format: ',.0f' },
    color: { field: 'group', title: 'Segment' },
    size: { field: 'size', title: 'Account size' },
  },
  trendline: { label: true },
  title: 'Scatter trendlines compute one fit per segment',
  legend: { position: 'top' },
  tooltip: true,
};

const trendLineSpec: ChartSpec = {
  type: 'area',
  data: timeSeries({ points: 42, start: new Date(2023, 0, 1), stepDays: 14, base: 410, trend: 5.2, seasonAmp: 32, noise: 16, seed: 96 }),
  encoding: {
    x: { field: 'date', type: 'temporal', title: 'Period', format: '%b %Y' },
    y: { field: 'value', title: 'Pipeline', format: ',.0f' },
  },
  curve: 'monotone',
  trendline: { label: true, strokeDash: [4, 4] },
  title: 'Line and area charts can carry the same derived fit',
  axes: { x: { ticks: 5, format: '%b %Y' }, y: { ticks: 4 } },
  tooltip: true,
};

const facetSpec: ChartSpec = {
  type: 'line',
  data: timeSeries({
    series: ['West', 'East', 'North', 'South'],
    points: 24,
    start: new Date(2025, 0, 1),
    stepDays: 30,
    base: 120,
    trend: 2.4,
    seasonAmp: 24,
    noise: 9,
    seed: 118,
  }),
  encoding: {
    x: { field: 'date', type: 'temporal', title: 'Month', format: '%b' },
    y: { field: 'value', title: 'Active teams', format: ',.0f' },
  },
  curve: 'monotone',
  points: true,
  facet: { field: 'series', columns: 2 },
  title: 'Regional adoption as comparable small multiples',
  axes: { x: { ticks: 4, format: '%b' }, y: { ticks: 3 } },
  tooltip: true,
};

const bigDataSpec: ChartSpec = {
  type: 'line',
  data: timeSeries({
    points: 5000,
    start: new Date(2020, 0, 1),
    stepDays: 1,
    base: 180,
    trend: 0.035,
    seasonAmp: 38,
    noise: 18,
    seed: 902,
  }),
  encoding: {
    x: { field: 'date', type: 'temporal', title: 'Day', format: '%b %Y' },
    y: { field: 'value', title: 'Daily requests', format: ',.2s' },
  },
  curve: 'monotone',
  title: 'Five thousand points, rendered smoothly',
  axes: { x: { ticks: 7, format: '%b %Y' }, y: { ticks: 4 } },
  tooltip: true,
};

const numberCode = `const rows = [
  { label: 'Usage', value: 1234 },
  { label: 'Revenue', value: 56789 },
  { label: 'Audience', value: 1234567 }
];

const currency = {
  type: 'bar',
  data: rows,
  encoding: { x: { field: 'label' }, y: { field: 'value', format: '$,.0f' } }
};

const percent = {
  ...currency,
  encoding: { x: { field: 'label' }, y: { field: 'value', format: '.1%' } }
};

const si = {
  ...currency,
  encoding: { x: { field: 'label' }, y: { field: 'value', format: ',.2s' } }
};`;

const dateCode = `const spec = {
  type: 'line',
  data: timeSeries({ points: 30, stepDays: 30, valueField: 'sessions' }),
  encoding: {
    x: { field: 'date', type: 'temporal', format: '%b %Y' },
    y: { field: 'sessions', format: ',.2s' }
  },
  axes: { x: { ticks: 6, format: '%b %Y' } }
};`;

const conditionalCode = `const table = {
  type: 'table',
  data: salesTable({ n: 36 }),
  columns: [
    { field: 'sales', format: '$,.0f', conditionalFormat: { type: 'bar', color: 'var(--accent)', baseline: 'min', showValue: true } },
    { field: 'margin', format: '.1%', conditionalFormat: { type: 'colorScale', scheme: 'teal', domain: [0.08, 0.58] } },
    { field: 'units', conditionalFormat: { type: 'icon', set: 'trafficLights', position: 'left' } },
    { field: 'profit', format: '$,.0f', conditionalFormat: { type: 'rules', rules: [{ when: 'lt', value: 90, color: 'var(--err)', weight: 'bold', icon: '⚠' }] } }
  ]
};

const matrix = {
  type: 'matrix',
  data: salesTable({ n: 36 }),
  rows: ['region'],
  columns: ['category'],
  values: [{ field: 'sales', op: 'sum', label: 'Share of region', showAs: 'percentOfRow' }]
};`;

const annotationCode = `const spec = {
  type: 'line',
  encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value' } },
  annotations: [
    { value: 168, label: 'Board target', strokeDash: [], strokeWidth: 2.5 },
    { type: 'band', from: 138, to: 158, label: 'Operating plan', fillOpacity: 0.14 },
    { type: 'zone', from: 0, to: 104, label: 'Watch zone', fillOpacity: 0.1 }
  ]
};`;

const insightsCode = `const before = { type: 'line', data: rows, encoding };
const after = { ...before, insights: { outliers: true } };

// insights:true is shorthand for { max: true, min: true }.
// { outliers:true } also labels points beyond Tukey's 1.5×IQR fences.`;

const trendCode = `const scatterSpec = {
  type: 'scatter',
  data: scatter({ groups: ['Enterprise', 'Self-serve'] }),
  encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y' }, color: { field: 'group' } },
  trendline: { label: true }
};

const areaSpec = {
  type: 'area',
  data: timeSeries({ points: 42 }),
  encoding: { x: { field: 'date', type: 'temporal' }, y: { field: 'value' } },
  trendline: { label: true, strokeDash: [4, 4] }
};`;

const facetCode = `const spec = {
  type: 'line',
  data: timeSeries({ series: ['West', 'East', 'North', 'South'], points: 24 }),
  encoding: {
    x: { field: 'date', type: 'temporal' },
    y: { field: 'value' }
  },
  facet: { field: 'series', columns: 2 }
};`;

const bigDataCode = `const spec = {
  type: 'line',
  data: timeSeries({ points: 5000, stepDays: 1 }),
  encoding: {
    x: { field: 'date', type: 'temporal', format: '%b %Y' },
    y: { field: 'value', format: ',.2s' }
  },
  curve: 'monotone'
};

// Graphein keeps the full data in the spec and applies LTTB-style downsampling
// during rendering so dense series stay responsive and visually faithful.`;

function Section({
  kicker,
  title,
  children,
  chart,
  code,
  codeTitle = 'Relevant spec fragment',
}: {
  kicker: string;
  title: string;
  children: ReactNode;
  chart: ReactNode;
  code: string;
  codeTitle?: string;
}) {
  return (
    <Card as="section" className="gx-rise overflow-hidden p-5 sm:p-6">
      <div className="mb-5 grid gap-3 lg:grid-cols-[0.76fr_0.24fr] lg:items-start">
        <div>
          <Kicker>{kicker}</Kicker>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text">{title}</h2>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-relaxed text-muted">{children}</div>
        </div>
        <div className="hidden justify-end lg:flex">
          <Chip tone="accent">Live ChartSpec</Chip>
        </div>
      </div>
      <Tabs
        tabs={[
          { id: 'chart', label: 'Chart', content: chart },
          {
            id: 'code',
            label: 'Code',
            content: <CodeBlock code={code} title={codeTitle} maxHeight={520} />,
          },
        ]}
      />
    </Card>
  );
}

function TwoUp({ left, right }: { left: ReactNode; right: ReactNode }) {
  return <div className="grid gap-4 xl:grid-cols-2">{left}{right}</div>;
}

export function Formatting() {
  return (
    <Page wide>
      <PageHeader
        kicker="Formatting & styling"
        title="Polished semantics without imperative chart code"
        blurb="Format numbers and dates, style cells from data, add reference context, derive insights and trendlines, facet comparisons, and render dense time series from one JSON-serializable ChartSpec."
      />

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="font-display text-2xl font-semibold text-text">3</div>
          <div className="text-sm text-muted">format hint families: d3-style numbers, strftime dates, and semantic cell rules</div>
        </Card>
        <Card className="p-4">
          <div className="font-display text-2xl font-semibold text-text">0</div>
          <div className="text-sm text-muted">callbacks required for annotations, insights, trendlines, facets, or LTTB downsampling</div>
        </Card>
        <Card className="p-4">
          <div className="font-display text-2xl font-semibold text-text">1</div>
          <div className="text-sm text-muted">portable object that validates before it renders in light, dark, browser, or headless mode</div>
        </Card>
      </div>

      <div className="space-y-6">
        <Section
          kicker="01 · Number formatting"
          title="One channel, many presentation grammars"
          code={numberCode}
          chart={
            <div className="grid gap-4 xl:grid-cols-3">
              <ChartStage spec={currencySpec} height={300} showSummary={false} />
              <ChartStage spec={percentSpec} height={300} showSummary={false} />
              <ChartStage spec={siSpec} height={300} showSummary={false} />
            </div>
          }
        >
          <p>
            <code className="font-mono text-text">FieldDef.format</code> is intentionally small and familiar:
            <code className="font-mono text-text"> $,.0f</code> for currency, <code className="font-mono text-text">.1%</code> for rates, and{' '}
            <code className="font-mono text-text">,.2s</code> for compact SI suffixes. The three bars reuse the same rows so the only change is the y-channel format hint.
          </p>
        </Section>

        <Section
          kicker="02 · Date / temporal formatting"
          title="Temporal axes speak in business time"
          code={dateCode}
          chart={<ChartStage spec={dateFormatSpec} height={430} />}
        >
          <p>
            Mark a field as <code className="font-mono text-text">type:'temporal'</code>, then use strftime-style patterns such as{' '}
            <code className="font-mono text-text">%b %Y</code>. Graphein coerces Date objects and ISO strings through the same formatter for axes, tooltips, and summaries.
          </p>
        </Section>

        <Section
          kicker="03 · Conditional formatting"
          title="Tables and matrices can carry visual grammar too"
          code={conditionalCode}
          chart={
            <div className="space-y-4">
              <ChartStage spec={conditionalTableSpec} height={390} showSummary={false} />
              <ChartStage spec={matrixSpec} height={330} showSummary={false} />
            </div>
          }
        >
          <p>
            The table combines in-cell data bars, a margin color scale, traffic-light icons, and rule-based profit emphasis. The matrix pivots the same orders and displays each category as a percent of its region via{' '}
            <code className="font-mono text-text">showAs:'percentOfRow'</code>.
          </p>
        </Section>

        <Section
          kicker="04 · Annotations"
          title="Targets, bands, and threshold zones are data"
          code={annotationCode}
          chart={<ChartStage spec={annotationSpec} height={440} />}
        >
          <p>
            Cartesian charts accept <code className="font-mono text-text">annotations</code> for reference lines, bands, zones, and point callouts. The example overlays a board target, the expected operating corridor, and a watch zone without precomputing overlay marks.
          </p>
        </Section>

        <Section
          kicker="05 · Insights"
          title="Let the chart mark its own max, min, and outliers"
          code={insightsCode}
          chart={
            <TwoUp
              left={<ChartStage spec={insightBaseSpec} height={360} />}
              right={<ChartStage spec={insightSpec} height={360} />}
            />
          }
        >
          <p>
            <code className="font-mono text-text">insights:true</code> adds deterministic ▲/▼ callouts for the maximum and minimum. Passing{' '}
            <code className="font-mono text-text">{'{ outliers:true }'}</code> also marks statistically unusual points, which keeps analytical labels reproducible.
          </p>
        </Section>

        <Section
          kicker="06 · Trendlines"
          title="Regression overlays are declared, not hand-drawn"
          code={trendCode}
          chart={
            <TwoUp
              left={<ChartStage spec={trendScatterSpec} height={410} />}
              right={<ChartStage spec={trendLineSpec} height={410} />}
            />
          }
        >
          <p>
            <code className="font-mono text-text">trendline:{'{ label:true }'}</code> computes a linear fit from the plotted rows and labels R². Scatter plots can fit per color group; temporal line and area charts use the same declarative overlay.
          </p>
        </Section>

        <Section
          kicker="07 · Faceting / small multiples"
          title="Split one tidy field into comparable panels"
          code={facetCode}
          chart={<ChartStage spec={facetSpec} height={560} />}
        >
          <p>
            <code className="font-mono text-text">facet:{'{ field, columns }'}</code> creates a trellis from a single field while sharing scales across every panel. Agents can compare regions without duplicating data or emitting four separate charts.
          </p>
        </Section>

        <Section
          kicker="08 · Big data / LTTB"
          title="Thousands of points stay smooth and inspectable"
          code={bigDataCode}
          chart={<ChartStage spec={bigDataSpec} height={430} />}
        >
          <p>
            Dense time series remain ordinary rows in the spec. Graphein applies a largest-triangle-three-buckets style downsampling pass during rendering, preserving the visible shape while keeping interaction and resize performance snappy.
          </p>
          <Callout title="Performance note" tone="neutral">
            The live example renders 5,000 daily observations through the same React wrapper and theme pipeline as the smaller charts.
          </Callout>
        </Section>
      </div>
    </Page>
  );
}
