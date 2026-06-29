import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { ChartSpec } from 'graphein';
import { ChartStage } from '../components/chart/ChartStage';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Page } from '../components/ui/Page';
import { ButtonLink, Card, Chip, GradientText, SectionHeader, SpectrumBar, Stat } from '../components/ui/primitives';

const heroSpec: ChartSpec = {
  type: 'area',
  data: [
    { week: '2026-01-05', surface: 'Docs', specs: 42 },
    { week: '2026-01-12', surface: 'Docs', specs: 58 },
    { week: '2026-01-19', surface: 'Docs', specs: 71 },
    { week: '2026-01-26', surface: 'Docs', specs: 86 },
    { week: '2026-02-02', surface: 'Docs', specs: 98 },
    { week: '2026-02-09', surface: 'Docs', specs: 118 },
    { week: '2026-01-05', surface: 'Playground', specs: 28 },
    { week: '2026-01-12', surface: 'Playground', specs: 39 },
    { week: '2026-01-19', surface: 'Playground', specs: 64 },
    { week: '2026-01-26', surface: 'Playground', specs: 92 },
    { week: '2026-02-02', surface: 'Playground', specs: 121 },
    { week: '2026-02-09', surface: 'Playground', specs: 149 },
    { week: '2026-01-05', surface: 'MCP', specs: 16 },
    { week: '2026-01-12', surface: 'MCP', specs: 27 },
    { week: '2026-01-19', surface: 'MCP', specs: 51 },
    { week: '2026-01-26', surface: 'MCP', specs: 83 },
    { week: '2026-02-02', surface: 'MCP', specs: 119 },
    { week: '2026-02-09', surface: 'MCP', specs: 171 },
  ],
  encoding: {
    x: { field: 'week', type: 'temporal', title: 'Week' },
    y: { field: 'specs', title: 'Specs rendered' },
    series: { field: 'surface' },
  },
  stack: true,
  curve: 'monotone',
  legend: { position: 'top' },
  axes: { x: { grid: false }, y: { ticks: 4 } },
  insights: { outliers: true },
  title: { text: 'Specs rendered by agents', subtitle: 'Tidy rows in, chart plus report out' },
};

const ruleSpec: ChartSpec = {
  type: 'line',
  data: [
    { month: '2026-01', channel: 'Self-serve', revenue: 42 },
    { month: '2026-02', channel: 'Self-serve', revenue: 55 },
    { month: '2026-03', channel: 'Self-serve', revenue: 73 },
    { month: '2026-04', channel: 'Self-serve', revenue: 91 },
    { month: '2026-01', channel: 'Sales-led', revenue: 67 },
    { month: '2026-02', channel: 'Sales-led', revenue: 79 },
    { month: '2026-03', channel: 'Sales-led', revenue: 88 },
    { month: '2026-04', channel: 'Sales-led', revenue: 116 },
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'revenue', title: 'Revenue ($k)' },
    series: { field: 'channel' },
  },
  curve: 'monotone',
  points: true,
  insights: true,
  title: 'Revenue by channel',
};

const ruleCode = `const spec = {
  type: 'line',
  data: [
    { month: '2026-01', channel: 'Self-serve', revenue: 42 },
    { month: '2026-02', channel: 'Self-serve', revenue: 55 },
    { month: '2026-03', channel: 'Self-serve', revenue: 73 },
    { month: '2026-04', channel: 'Self-serve', revenue: 91 },
    { month: '2026-01', channel: 'Sales-led', revenue: 67 },
    { month: '2026-02', channel: 'Sales-led', revenue: 79 },
    { month: '2026-03', channel: 'Sales-led', revenue: 88 },
    { month: '2026-04', channel: 'Sales-led', revenue: 116 }
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'revenue', title: 'Revenue ($k)' },
    series: { field: 'channel' }
  }
};`;

type MiniChart = {
  name: string;
  note: string;
  spec: ChartSpec;
  height?: number;
  className?: string;
};

const miniCharts: MiniChart[] = [
  {
    name: 'Line',
    note: 'Retention by cohort',
    spec: {
      type: 'line',
      data: [
        { week: 'W1', cohort: 'January', retained: 100 },
        { week: 'W2', cohort: 'January', retained: 72 },
        { week: 'W3', cohort: 'January', retained: 61 },
        { week: 'W4', cohort: 'January', retained: 54 },
        { week: 'W1', cohort: 'February', retained: 100 },
        { week: 'W2', cohort: 'February', retained: 77 },
        { week: 'W3', cohort: 'February', retained: 66 },
        { week: 'W4', cohort: 'February', retained: 62 },
      ],
      encoding: { x: { field: 'week' }, y: { field: 'retained', title: 'Retained %' }, series: { field: 'cohort' } },
      points: true,
      title: 'Cohort retention',
    },
  },
  {
    name: 'Bar',
    note: 'Pipeline by stage',
    spec: {
      type: 'bar',
      data: [
        { stage: 'Lead', deals: 142 },
        { stage: 'Qualified', deals: 86 },
        { stage: 'Proposal', deals: 41 },
        { stage: 'Closed', deals: 24 },
      ],
      encoding: { x: { field: 'stage' }, y: { field: 'deals' } },
      title: 'Deals by stage',
    },
  },
  {
    name: 'Scatter',
    note: 'Cost versus latency',
    spec: {
      type: 'scatter',
      data: [
        { cost: 18, latency: 210, tier: 'Free' },
        { cost: 28, latency: 188, tier: 'Free' },
        { cost: 44, latency: 153, tier: 'Team' },
        { cost: 61, latency: 132, tier: 'Team' },
        { cost: 82, latency: 98, tier: 'Business' },
        { cost: 97, latency: 86, tier: 'Business' },
      ],
      encoding: {
        x: { field: 'cost', title: 'Monthly cost' },
        y: { field: 'latency', title: 'Latency ms' },
        color: { field: 'tier' },
      },
      trendline: { label: true },
      title: 'Cost and latency',
    },
  },
  {
    name: 'Pie',
    note: 'Support mix',
    spec: {
      type: 'pie',
      data: [
        { queue: 'Billing', tickets: 32 },
        { queue: 'Auth', tickets: 24 },
        { queue: 'API', tickets: 18 },
        { queue: 'Data', tickets: 14 },
        { queue: 'Other', tickets: 12 },
      ],
      encoding: { theta: { field: 'tickets' }, color: { field: 'queue' } },
      donut: 0.58,
      labels: { placement: 'auto', content: 'category-percent', connector: 'muted' },
      title: 'Tickets by queue',
    },
  },
  {
    name: 'Heatmap',
    note: 'Incidents by hour',
    spec: {
      type: 'heatmap',
      data: [
        { day: 'Mon', hour: '09', load: 12 },
        { day: 'Mon', hour: '12', load: 18 },
        { day: 'Mon', hour: '15', load: 22 },
        { day: 'Tue', hour: '09', load: 16 },
        { day: 'Tue', hour: '12', load: 28 },
        { day: 'Tue', hour: '15', load: 31 },
        { day: 'Wed', hour: '09', load: 9 },
        { day: 'Wed', hour: '12', load: 19 },
        { day: 'Wed', hour: '15', load: 26 },
      ],
      encoding: { x: { field: 'hour' }, y: { field: 'day' }, color: { field: 'load', type: 'quantitative' } },
      scheme: 'teal',
      title: 'Queue load',
    },
  },
  {
    name: 'Sankey',
    note: 'Revenue flow',
    spec: {
      type: 'sankey',
      data: [
        { source: 'ARR', target: 'Product', value: 54 },
        { source: 'ARR', target: 'Sales', value: 28 },
        { source: 'ARR', target: 'Support', value: 18 },
        { source: 'Product', target: 'Net income', value: 21 },
        { source: 'Sales', target: 'Net income', value: 9 },
        { source: 'Support', target: 'Net income', value: 7 },
      ],
      encoding: { source: { field: 'source' }, target: { field: 'target' }, value: { field: 'value' } },
      nodePadding: 14,
      title: 'ARR allocation',
    },
    className: 'lg:col-span-2',
  },
  {
    name: 'KPI',
    note: 'Metric with sparkline',
    spec: {
      type: 'kpi',
      data: [
        { week: 'W1', activations: 520 },
        { week: 'W2', activations: 610 },
        { week: 'W3', activations: 690 },
        { week: 'W4', activations: 760 },
      ],
      value: { field: 'activations', aggregate: 'sum' },
      label: 'Monthly activations',
      delta: 0.18,
      sparkline: { field: 'activations' },
      title: 'Activation pace',
    },
    height: 210,
  },
  {
    name: 'Treemap',
    note: 'Spend by service',
    spec: {
      type: 'treemap',
      data: [
        { group: 'Compute', service: 'API', cost: 148 },
        { group: 'Compute', service: 'Workers', cost: 92 },
        { group: 'Storage', service: 'Warehouse', cost: 116 },
        { group: 'Storage', service: 'Objects', cost: 64 },
        { group: 'Network', service: 'CDN', cost: 58 },
        { group: 'Network', service: 'Egress', cost: 73 },
      ],
      encoding: { group: { field: 'group' }, category: { field: 'service' }, value: { field: 'cost' } },
      labels: true,
      title: 'Cloud cost',
    },
    className: 'lg:col-span-2',
  },
];

const loopSteps = [
  ['Validate', 'Catch missing fields before a chart mounts.'],
  ['Repair', 'Apply safe JSON Patch fixes and keep the diff visible.'],
  ['Render', 'Render the same ChartSpec in React, vanilla DOM, or headless Node.'],
  ['Report', 'Read mark counts, clipping, contrast, and summary text.'],
] as const;

const pillars = [
  {
    title: 'Dependency-free core',
    copy: 'The graphein core ships the grammar, renderer, validation, repairSpec(), summarize(), and report() with zero runtime dependencies.',
    tag: 'graphein',
  },
  {
    title: 'Reports and summaries',
    copy: 'summarize() returns deterministic alt text. report() returns mark counts, clipping, contrast, and summary diagnostics.',
    tag: 'report()',
  },
  {
    title: 'Browser, Node, and MCP',
    copy: '@graphein/react mounts charts, @graphein/node exports PNGs, and graphein-mcp exposes validate, repair, render, and summarize tools.',
    tag: 'SSR + MCP',
  },
] as const;

function rise(ms: number): CSSProperties {
  return { '--d': `${ms}ms` } as CSSProperties;
}

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

export function Home() {
  return (
    <Page wide>
      <section className="relative isolate overflow-hidden rounded-3xl border border-border bg-bg px-5 py-6 shadow-sm sm:px-8 lg:px-10 lg:py-10">
        <div className="aurora" />
        <div className="relative grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="gx-rise">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="accent">Agent-first data visualization</Chip>
              <Chip>JSON-serializable specs</Chip>
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-5xl font-semibold tracking-tight text-text sm:text-7xl">
              <GradientText animate>Charts an agent can finish.</GradientText>
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
              Graphein turns tidy rows and one ChartSpec into a chart, validation result, and RenderReport.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ButtonLink to="/learn" size="lg">
                Start Learn Track <Arrow />
              </ButtonLink>
              <ButtonLink to="/charts" variant="outline" size="lg">
                Browse Chart Catalog <Arrow />
              </ButtonLink>
            </div>
            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
              <div className="rounded-2xl border border-border bg-surface/90 p-4">
                <Stat value="1" label="ChartSpec contract" gradient />
              </div>
              <div className="rounded-2xl border border-border bg-surface/90 p-4">
                <Stat value="0" label="core dependencies" gradient />
              </div>
              <div className="rounded-2xl border border-border bg-surface/90 p-4">
                <Stat value="4" label="loop calls" gradient />
              </div>
            </div>
          </div>

          <div className="gx-rise" style={rise(100)}>
            <Card className="overflow-hidden bg-surface p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <div>
                  <div className="font-mono text-xs font-semibold uppercase tracking-wide text-accent">Live ChartStage</div>
                  <p className="text-sm text-muted">This chart renders from the ChartSpec shown below.</p>
                </div>
                <div className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-spec-1" />
                  <span className="h-2.5 w-2.5 rounded-full bg-spec-2" />
                  <span className="h-2.5 w-2.5 rounded-full bg-spec-3" />
                  <span className="h-2.5 w-2.5 rounded-full bg-spec-4" />
                </div>
              </div>
              <ChartStage spec={heroSpec} height={430} />
            </Card>
          </div>
        </div>
      </section>

      <section className="mt-14 grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
        <div className="gx-rise" style={rise(80)}>
          <SectionHeader
            eyebrow="The one rule"
            title="Emit One ChartSpec"
            lead="Keep tidy rows. Map fields to channels. Validate before render."
          />
          <div className="mt-5">
            <CodeBlock code={ruleCode} lang="ts" title="chart-spec.ts" maxHeight={470} />
          </div>
        </div>
        <div className="gx-rise" style={rise(140)}>
          <Card className="flex h-full flex-col p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text">Same object, rendered chart</div>
                <p className="text-sm text-muted">No drawing commands. No callbacks. No hidden state.</p>
              </div>
              <Chip tone="ok">valid</Chip>
            </div>
            <ChartStage spec={ruleSpec} height={420} />
          </Card>
        </div>
      </section>

      <section className="mt-16">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <SectionHeader
            eyebrow="Chart types"
            title="One Grammar, 22 Chart Types"
            lead="Choose the chart type by question. The ChartSpec shape stays consistent."
          />
          <ButtonLink to="/charts" variant="ghost">
            View chart catalog <Arrow />
          </ButtonLink>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {miniCharts.map((chart, index) => (
            <Link
              key={chart.name}
              to="/charts"
              className={`group gx-rise spectrum-border rounded-2xl ${chart.className ?? ''}`}
              style={rise(index * 35)}
            >
              <Card className="h-full overflow-hidden p-3 transition group-hover:-translate-y-0.5">
                <div className="mb-2 flex items-start justify-between gap-2 px-1">
                  <div>
                    <h3 className="font-display text-lg font-semibold text-text">{chart.name}</h3>
                    <p className="text-sm text-muted">{chart.note}</p>
                  </div>
                  <Arrow />
                </div>
                <ChartStage spec={chart.spec} height={chart.height ?? 260} showSummary={false} />
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16 rounded-3xl border border-border bg-surface p-5 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div className="gx-rise">
            <SectionHeader
              eyebrow="Render → Report Loop"
              title="Close the Loop Without Screenshots"
              lead="The API returns RenderReport diagnostics, so an agent can fix the ChartSpec without reading screenshots."
            />
            <SpectrumBar className="mt-6 w-32" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {loopSteps.map(([title, copy], index) => (
              <div key={title} className="gx-rise" style={rise(index * 70)}>
                <Card className="h-full p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 font-mono text-sm font-semibold text-accent">
                      {index + 1}
                    </div>
                    <h3 className="font-display text-xl font-semibold text-text">{title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{copy}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-16">
        <SectionHeader
          eyebrow="Runtime facts"
          title="Generated Charts With Machine Checks"
          lead="The same ChartSpec runs in the editor, browser, Node, and MCP."
          align="center"
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {pillars.map((pillar, index) => (
            <div key={pillar.title} className="gx-rise" style={rise(index * 80)}>
              <Card className="spectrum-border h-full p-6">
                <Chip tone="accent">{pillar.tag}</Chip>
                <h3 className="mt-4 font-display text-2xl font-semibold tracking-tight text-text">{pillar.title}</h3>
                <p className="mt-3 leading-relaxed text-muted">{pillar.copy}</p>
              </Card>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mt-16 overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-10">
        <div className="aurora" />
        <div className="relative mx-auto max-w-3xl text-center">
          <Chip tone="accent">Start with ChartSpec</Chip>
          <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">
            <GradientText>Give Your Agent a Chart Contract</GradientText>
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            Learn the grammar, copy a working spec, then inspect the RenderReport before release.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <ButtonLink to="/learn" size="lg">
              Start Learn Track <Arrow />
            </ButtonLink>
            <ButtonLink to="/charts" variant="outline" size="lg">
              Browse Chart Catalog <Arrow />
            </ButtonLink>
          </div>
        </div>
      </section>
    </Page>
  );
}
