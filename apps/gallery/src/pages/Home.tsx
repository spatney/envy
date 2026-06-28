import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { ChartSpec } from 'graphein';
import { ChartStage } from '../components/chart/ChartStage';
import { Page } from '../components/ui/Page';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Callout, Card, Chip, Kicker } from '../components/ui/primitives';
import { timeSeries } from '../content/data';

const heroSpec: ChartSpec = {
  type: 'area',
  data: timeSeries({
    series: ['West', 'East', 'North', 'South'],
    points: 48,
    seed: 5,
    base: 85,
    trend: 1.35,
    seasonAmp: 22,
    noise: 7,
  }),
  encoding: {
    x: { field: 'date', type: 'temporal', title: 'Week' },
    y: { field: 'value', title: 'Adoption' },
    series: { field: 'series', title: 'Region' },
  },
  stack: true,
  curve: 'monotone',
  title: {
    text: 'Agent-authored adoption, live',
    subtitle: 'Four tidy series rendered from one JSON-serializable spec',
  },
  legend: { position: 'top' },
  axes: { x: { grid: false }, y: { ticks: 4 } },
  tooltip: true,
};

const oneRuleSpec: ChartSpec = {
  type: 'line',
  data: [
    { month: '2026-01', channel: 'Self-serve', revenue: 42 },
    { month: '2026-02', channel: 'Self-serve', revenue: 58 },
    { month: '2026-03', channel: 'Self-serve', revenue: 71 },
    { month: '2026-04', channel: 'Self-serve', revenue: 89 },
    { month: '2026-01', channel: 'Enterprise', revenue: 64 },
    { month: '2026-02', channel: 'Enterprise', revenue: 72 },
    { month: '2026-03', channel: 'Enterprise', revenue: 94 },
    { month: '2026-04', channel: 'Enterprise', revenue: 118 },
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'revenue', title: 'Revenue' },
    series: { field: 'channel' },
  },
  curve: 'monotone',
  points: true,
  insights: true,
  title: 'Revenue momentum',
};

const oneRuleCode = `import { render, validateSpec } from 'graphein';

const spec = ${JSON.stringify(oneRuleSpec, null, 2)};

const { valid, errors } = validateSpec(spec);
if (!valid) throw new Error(errors[0].message);

const chart = render('#chart', spec);
chart.report(); // mark count, clipped labels, contrast, summary`;

const features = [
  {
    title: '22+ chart types',
    route: '/charts/line-single',
    chip: 'Showcase',
    copy: 'Lines, areas, bars, maps, Sankey, waterfall, KPI cards, matrices, tables, slicers, and more — each backed by runnable specs.',
  },
  {
    title: 'Validate → repair',
    route: '/playground',
    chip: 'Self-healing',
    copy: 'Agents can validate before rendering, apply safe JSON Patch fixes with repairSpec(), and re-check without guessing.',
  },
  {
    title: 'Render reports',
    route: '/foundations',
    chip: 'Self-describing',
    copy: 'Every chart can explain itself with deterministic summarize() output and flag clipped labels, overflow, and contrast issues.',
  },
  {
    title: 'Server-side rendering',
    route: '/ssr',
    chip: 'PNG-ready',
    copy: '@graphein/node renders the same specs headlessly for reports, Slack digests, PDFs, and CI snapshots.',
  },
  {
    title: 'MCP server',
    route: '/mcp',
    chip: 'Agent tools',
    copy: 'Expose the schema, examples, validation, repair, and render-report loop directly to coding agents.',
  },
  {
    title: 'Dashboards & selections',
    route: '/interactivity',
    chip: 'Interactive',
    copy: 'Slicers, cross-filtering, highlighting, and dashboard layout are plain JSON — no callback maze required.',
  },
  {
    title: 'Themes + sketch',
    route: '/foundations',
    chip: 'Expressive',
    copy: 'Switch polished light/dark themes or flip into a hand-drawn sketch aesthetic while keeping the spec portable.',
  },
  {
    title: 'Zero-dependency core',
    route: '/packages',
    chip: 'Portable',
    copy: 'The core engine stays dependency-free, tree-shakeable, and explicit; integrations live in focused leaf packages.',
  },
];

const packages = [
  ['graphein', 'Dependency-free chart engine, validation, repair, summarize(), and render reports.'],
  ['@graphein/react', 'A React wrapper that keeps ChartSpec as the only API surface.'],
  ['@graphein/node', 'Headless PNG rendering for automation, CI, and server workflows.'],
  ['graphein-mcp', 'An MCP server that gives agents the schema, docs, examples, and checks.'],
] as const;

const steps = [
  {
    title: 'Shape tidy data',
    copy: 'One row per observation. Split groups with a series field instead of pre-pivoting.',
    code: `[
  { month: 'Jan', region: 'West', sales: 420 },
  { month: 'Jan', region: 'East', sales: 380 }
]`,
  },
  {
    title: 'Pick type + encoding',
    copy: 'Choose the visual intent, then map columns to channels. The rest is inferred safely.',
    code: `{
  type: 'line',
  encoding: {
    x: { field: 'month' },
    y: { field: 'sales' },
    series: { field: 'region' }
  }
}`,
  },
  {
    title: 'Validate + render',
    copy: 'Catch schema issues, auto-repair safe mistakes, render, then inspect the report.',
    code: `const fixed = repairSpec(spec);
validateSpec(fixed.spec);
const chart = render('#app', fixed.spec);
chart.report();`,
  },
];

function Arrow() {
  return <span aria-hidden="true">→</span>;
}

function riseDelay(ms: number): CSSProperties {
  return { '--d': `${ms}ms` } as CSSProperties;
}

export function Home() {
  return (
    <Page wide>
      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-sm sm:p-8 lg:p-10">
        <div className="absolute inset-x-0 top-0 h-1 bg-accent" />
        <div className="absolute right-8 top-8 hidden h-28 w-28 rounded-full border border-accent bg-accent-soft lg:block" />
        <div className="relative grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="gx-rise">
            <Kicker>Graphein</Kicker>
            <div className="mt-4 flex flex-wrap gap-2">
              <Chip tone="accent">The agent-first dataviz library</Chip>
              <Chip>One spec in, production chart out</Chip>
            </div>
            <h1 className="mt-5 max-w-4xl font-display text-4xl font-semibold tracking-tight text-text sm:text-6xl">
              Emit one JSON object. Get a beautiful, self-describing chart.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted sm:text-xl">
              Graphein is built for agents that need to move from data to polished insight in one
              reliable step: validate the spec, render the visual, read the report, and ship.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/charts/line-single"
                className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-contrast shadow-sm transition hover:opacity-90"
              >
                Explore charts <Arrow />
              </Link>
              <Link
                to="/playground"
                className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-5 py-3 text-sm font-semibold text-text transition hover:border-accent hover:text-accent"
              >
                Open the Playground <Arrow />
              </Link>
              <a
                href="https://github.com/spatney/graphein"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-3 text-sm font-semibold text-muted transition hover:border-accent hover:text-accent"
              >
                GitHub <Arrow />
              </a>
            </div>
            <div className="mt-8 grid max-w-2xl grid-cols-3 gap-3">
              {[
                ['22+', 'chart types'],
                ['0', 'core deps'],
                ['1', 'JSON spec'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-border bg-surface-2 p-3">
                  <div className="font-display text-2xl font-semibold text-text">{value}</div>
                  <div className="text-xs font-medium uppercase tracking-wide text-faint">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="gx-rise" style={riseDelay(90)}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-mono text-xs font-semibold uppercase tracking-wide text-accent">
                  Live ChartSpec
                </div>
                <p className="text-sm text-muted">Theme-aware, responsive, and reporting on itself.</p>
              </div>
              <Chip tone="ok">HMR live</Chip>
            </div>
            <ChartStage spec={heroSpec} height={430} />
          </div>
        </div>
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <div className="gx-rise" style={riseDelay(130)}>
          <Kicker>The one rule</Kicker>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">
            A single ChartSpec is the contract.
          </h2>
          <p className="mt-3 text-lg leading-relaxed text-muted">
            No imperative drawing, no callback soup, no hidden state. Graphein’s API is a
            JSON-serializable object that agents can generate, inspect, repair, diff, and reuse.
          </p>
          <Callout title="Agent loop, closed">
            Validate the spec before rendering. After render, read the machine-readable report for
            mark counts, layout health, contrast checks, and deterministic alt text.
          </Callout>
          <div className="mt-5">
            <CodeBlock code={oneRuleCode} lang="ts" title="one-chart.ts" maxHeight={430} />
          </div>
        </div>
        <div className="gx-rise" style={riseDelay(180)}>
          <Card className="flex h-full flex-col p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-text">Same spec, live result</div>
                <div className="text-sm text-muted">Rendered with @graphein/react.</div>
              </div>
              <Chip tone="accent">summarize()</Chip>
            </div>
            <ChartStage spec={oneRuleSpec} height={420} />
          </Card>
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <Kicker>Why teams choose Graphein</Kicker>
            <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">
              Built for chart generation you can trust.
            </h2>
          </div>
          <Link to="/foundations" className="text-sm font-semibold text-accent hover:underline">
            Read the foundations <Arrow />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <Link key={feature.title} to={feature.route} className="group gx-rise block" style={riseDelay(index * 35)}>
              <Card className="h-full p-5 transition group-hover:-translate-y-0.5 group-hover:border-accent">
                <Chip tone="accent">{feature.chip}</Chip>
                <h3 className="mt-4 font-display text-xl font-semibold text-text">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{feature.copy}</p>
                <div className="mt-4 text-sm font-semibold text-accent">
                  Explore <Arrow />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-14 rounded-2xl border border-border bg-surface-2 p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <Kicker>Packages</Kicker>
            <h2 className="mt-1 font-display text-2xl font-semibold text-text">
              One grammar across browser, React, Node, and agent tooling.
            </h2>
          </div>
          <Link to="/packages" className="text-sm font-semibold text-accent hover:underline">
            View package guide <Arrow />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-4">
          {packages.map(([name, copy]) => (
            <Link key={name} to="/packages" className="rounded-xl border border-border bg-surface p-4 transition hover:border-accent">
              <div className="font-mono text-sm font-semibold text-accent">{name}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{copy}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-6">
          <Kicker>How it works</Kicker>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text">
            Three steps from tidy data to trustworthy visual.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="gx-rise" style={riseDelay(index * 70)}>
              <Card className="h-full p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft font-display text-lg font-semibold text-accent">
                    {index + 1}
                  </div>
                  <h3 className="font-display text-xl font-semibold text-text">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted">{step.copy}</p>
                <pre className="mt-4 overflow-auto rounded-xl border border-border bg-surface-2 p-4 font-mono text-xs leading-relaxed text-muted">
                  <code>{step.code}</code>
                </pre>
              </Card>
            </div>
          ))}
        </div>
      </section>
    </Page>
  );
}
