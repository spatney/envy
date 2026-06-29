import type { ReactNode } from 'react';
import type { ChartSpec, DashboardSpec } from 'graphein';
import { ChartCanvas } from '../components/chart/ChartCanvas';
import { DashboardCanvas } from '../components/chart/DashboardCanvas';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Page, PageHeader } from '../components/ui/Page';
import {
  Callout,
  Card,
  Chip,
  Kicker,
  SectionHeader,
  SpectrumBar,
} from '../components/ui/primitives';
import { dashboardDemo } from '../content/interactive';

const chartSpec: ChartSpec = {
  type: 'line',
  title: { text: 'Activation by segment', subtitle: 'Rendered live by @graphein/react' },
  data: [
    { week: '2026-01-05', segment: 'Enterprise', activation: 62 },
    { week: '2026-01-12', segment: 'Enterprise', activation: 68 },
    { week: '2026-01-19', segment: 'Enterprise', activation: 74 },
    { week: '2026-01-26', segment: 'Enterprise', activation: 79 },
    { week: '2026-01-05', segment: 'Self-serve', activation: 44 },
    { week: '2026-01-12', segment: 'Self-serve', activation: 49 },
    { week: '2026-01-19', segment: 'Self-serve', activation: 53 },
    { week: '2026-01-26', segment: 'Self-serve', activation: 58 },
  ],
  encoding: {
    x: { field: 'week', type: 'temporal', title: 'Week' },
    y: { field: 'activation', type: 'quantitative', title: 'Activation score' },
    series: { field: 'segment', title: 'Segment' },
  },
  curve: 'monotone',
  points: true,
  legend: { position: 'top' },
  tooltip: true,
};

const dashboardSpec: DashboardSpec = dashboardDemo();

const chartCode = `import { Chart } from '@graphein/react';
import type { ChartSpec } from 'graphein';

const spec: ChartSpec = {
  type: 'line',
  data: [
    { week: '2026-01-05', segment: 'Enterprise', activation: 62 },
    { week: '2026-01-12', segment: 'Enterprise', activation: 68 },
    { week: '2026-01-19', segment: 'Enterprise', activation: 74 },
    { week: '2026-01-26', segment: 'Enterprise', activation: 79 },
    { week: '2026-01-05', segment: 'Self-serve', activation: 44 },
    { week: '2026-01-12', segment: 'Self-serve', activation: 49 },
    { week: '2026-01-19', segment: 'Self-serve', activation: 53 },
    { week: '2026-01-26', segment: 'Self-serve', activation: 58 },
  ],
  encoding: {
    x: { field: 'week', type: 'temporal' },
    y: { field: 'activation', type: 'quantitative' },
    series: { field: 'segment' },
  },
  points: true,
};

export function ActivationChart() {
  return (
    <div style={{ height: 360 }}>
      <Chart spec={spec} />
    </div>
  );
}`;

const dashboardCode = `import { Dashboard } from '@graphein/react';
import type { DashboardSpec } from 'graphein';

const spec: DashboardSpec = {
  type: 'dashboard',
  data: rows,
  layout: {
    sections: [
      { title: 'Overview', views: ['region', 'revenue'] },
      { title: 'Trend', views: ['trend'] },
    ],
  },
  views: [
    { id: 'region', spec: { type: 'dropdown', field: 'region', multiple: true }, w: 3, h: 2 },
    { id: 'revenue', spec: { type: 'kpi', value: { field: 'sales', aggregate: 'sum' } }, w: 3, h: 2 },
    {
      id: 'trend',
      spec: {
        type: 'line',
        encoding: {
          x: { field: 'month', type: 'temporal' },
          y: { field: 'sales' },
          series: { field: 'region' },
        },
      },
      w: 9,
      h: 3,
    },
  ],
  interactions: 'auto',
};

export function RevenueDashboard() {
  return <Dashboard spec={spec} />;
}`;

const useChartCode = `import { useCallback, useState } from 'react';
import { useChart } from '@graphein/react';
import type { ChartInstance, ChartSpec, RenderReport } from 'graphein';

export function ReportAwareChart({ spec }: { spec: ChartSpec }) {
  const [report, setReport] = useState<RenderReport | null>(null);

  const onReady = useCallback((chart: ChartInstance) => {
    const next = chart.report();
    setReport(next);
    console.log(next.summary);
  }, []);

  const ref = useChart<HTMLDivElement>(spec, { onReady });

  return (
    <section>
      <div ref={ref} style={{ width: '100%', height: 360 }} />
      <p>{report?.ok ? 'Ready to ship' : 'Needs review'}</p>
    </section>
  );
}`;

const themingCode = `import { Chart } from '@graphein/react';

const themedSpec = {
  ...spec,
  theme: {
    base: 'dark',
    color: {
      background: '#0f172a',
      surface: '#111827',
      text: '#f8fafc',
      textMuted: '#94a3b8',
      accent: '#2dd4bf',
      palette: ['#2dd4bf', '#a78bfa', '#f59e0b'],
    },
    radius: 14,
  },
};

export function ThemedChart() {
  return (
    <div style={{ height: 360 }}>
      <Chart spec={themedSpec} />
    </div>
  );
}`;

function GuideSection({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <Card className="p-4 sm:p-5" as="section">
      <Kicker>{kicker}</Kicker>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text">{title}</h2>
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export function ReactUsage() {
  return (
    <Page wide>
      <PageHeader
        kicker="React"
        title="Use Graphein in React"
        blurb="The React package mounts the same ChartSpecs with components, StrictMode-safe hooks, shared selection stores, and spec-level theming."
      />

      <div className="mb-7 grid gap-3 md:grid-cols-4">
        {[
          ['<Chart />', 'Fill a sized parent and update when the ChartSpec reference changes.'],
          ['<Dashboard />', 'Render a cross-filtered page from one DashboardSpec.'],
          ['useChart()', 'Attach a ref when you need the live ChartInstance.'],
          ['theme', 'Use spec.theme for light, dark, or token overrides.'],
        ].map(([label, copy], index) => (
          <Card key={label} className="p-4">
            <div className={`mb-3 h-1.5 w-12 rounded-full spec-${index + 1}`} />
            <Chip tone="accent">{label}</Chip>
            <p className="mt-3 text-sm leading-relaxed text-muted">{copy}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6">
        <GuideSection kicker="01" title="Render a ChartSpec with <Chart spec={...} />">
          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-border bg-surface-2 p-3">
              <div className="h-[390px] rounded-xl border border-border bg-surface p-2">
                <ChartCanvas spec={chartSpec} />
              </div>
            </div>
            <div className="grid content-start gap-4">
              <Callout title="Parent size is the contract" tone="neutral">
                <span className="font-mono text-text">Chart</span> renders a fill-by-default div.
                Give the parent a height; pass a new spec to update in place; unmounting tears the
                chart down.
              </Callout>
              <CodeBlock code={chartCode} lang="tsx" title="Chart component" maxHeight={520} />
            </div>
          </div>
        </GuideSection>

        <GuideSection kicker="02" title="Compose dashboards with <Dashboard spec />">
          <div className="grid gap-5">
            <div className="rounded-2xl border border-border bg-surface-2 p-3">
              <DashboardCanvas spec={dashboardSpec} className="min-h-[740px]" />
            </div>
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Callout title="Dashboards stay JSON-serializable" tone="neutral">
                Layout sections, card chrome, slicers, KPIs, charts, and{' '}
                <span className="font-mono text-text">interactions:'auto'</span> live in the
                spec. Slicers filter views whose data carries the same field.
              </Callout>
              <CodeBlock code={dashboardCode} lang="tsx" title="Dashboard component" maxHeight={560} />
            </div>
          </div>
        </GuideSection>

        <GuideSection kicker="03" title="Use useChart when React owns the container">
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <h3 className="font-display text-xl font-semibold text-text">The Hook Returns a Ref</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Mount into an existing card, editor pane, notebook cell, or split panel.{' '}
                <span className="font-mono text-text">onReady</span> receives the live instance
                after mount and update, so you can read <span className="font-mono text-text">report()</span>{' '}
                or wire selection events.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip>chart.update()</Chip>
                <Chip>chart.resize()</Chip>
                <Chip>chart.destroy()</Chip>
                <Chip>chart.report()</Chip>
              </div>
            </div>
            <CodeBlock code={useChartCode} lang="tsx" title="useChart with report()" maxHeight={560} />
          </div>
        </GuideSection>

        <GuideSection kicker="04" title="Theme from the Spec, Not React Callbacks">
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <SectionHeader
                eyebrow="Theming"
                title="Built-in Light/Dark Plus Token Overrides"
                lead="Set theme:'light', theme:'dark', or pass a partial theme object with color, font, spacing, radius, and stroke overrides. The same object works in core, React, Node, and MCP."
              />
              <SpectrumBar className="mt-5" />
            </div>
            <CodeBlock code={themingCode} lang="tsx" title="Spec-level theme override" maxHeight={500} />
          </div>
        </GuideSection>
      </div>
    </Page>
  );
}
