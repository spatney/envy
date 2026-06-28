import type { ReactNode } from 'react';
import type { ChartSpec, DashboardSpec } from 'graphein';
import { ChartCanvas } from '../components/chart/ChartCanvas';
import { DashboardCanvas } from '../components/chart/DashboardCanvas';
import { Page, PageHeader } from '../components/ui/Page';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Tabs } from '../components/ui/Tabs';
import { Callout, Card, Chip, Kicker } from '../components/ui/primitives';
import { timeSeries } from '../content/data';
import { dashboardDemo } from '../content/interactive';

const chartSpec: ChartSpec = {
  type: 'line',
  data: timeSeries({
    series: ['Enterprise', 'Self-serve', 'Partner'],
    points: 18,
    start: new Date(2025, 0, 1),
    stepDays: 14,
    base: 80,
    trend: 2.2,
    seasonAmp: 12,
    noise: 5,
    seed: 27,
    valueField: 'activationRate',
  }),
  encoding: {
    x: { field: 'date', type: 'temporal', title: 'Launch window' },
    y: { field: 'activationRate', title: 'Activation score' },
    series: { field: 'series', title: 'Segment' },
  },
  curve: 'monotone',
  points: true,
  trendline: { label: true },
  title: {
    text: 'Activation lift by segment',
    subtitle: 'The exact ChartSpec below is rendered live by the React wrapper',
  },
  legend: { position: 'top' },
  tooltip: true,
};

const dashboardSpec: DashboardSpec = dashboardDemo();

const chartComponentCode = `import { Chart } from '@graphein/react';
import type { ChartSpec } from 'graphein';

const spec: ChartSpec = ${JSON.stringify(chartSpec, null, 2)};

export function ActivationChart() {
  return (
    <div style={{ height: 360 }}>
      <Chart spec={spec} />
    </div>
  );
}`;

const useChartCode = `import { useCallback, useState } from 'react';
import { useChart } from '@graphein/react';
import type { ChartInstance, RenderReport } from 'graphein';

export function ReportAwareChart({ spec }: { spec: ChartSpec }) {
  const [report, setReport] = useState<RenderReport | null>(null);

  const onReady = useCallback((chart: ChartInstance) => {
    setReport(chart.report());
    console.log(chart.report().summary);
  }, []);

  const ref = useChart<HTMLDivElement>(spec, { onReady });

  return (
    <section>
      <div ref={ref} style={{ width: '100%', height: 360 }} />
      <p>{report?.ok ? 'Ready to ship' : 'Needs attention'}</p>
    </section>
  );
}`;

const dashboardCode = `import { useMemo, useState } from 'react';
import { Dashboard, useDashboard } from '@graphein/react';
import type { DashboardInstance, DashboardSpec } from 'graphein';

export function RevenueCockpit({ spec }: { spec: DashboardSpec }) {
  const [dashboard, setDashboard] = useState<DashboardInstance | null>(null);

  return (
    <Dashboard
      spec={spec}
      onReady={(d) => {
        setDashboard(d);
        d.on('selectionchange', (name, value) => {
          console.log('selection changed', name, value);
        });
      }}
    />
  );
}

export function RefMountedDashboard({ spec }: { spec: DashboardSpec }) {
  const ref = useDashboard<HTMLDivElement>(spec, {
    onReady(d) {
      d.getSelection();
      d.setSelection('region', { kind: 'set', field: 'region', values: ['West'] });
      d.on('selectionchange', (name, value) => console.log(name, value));
    },
  });

  return <div ref={ref} />;
}`;

const selectionCode = `import { useMemo } from 'react';
import { Chart, Dashboard, useSelection } from '@graphein/react';
import { createSelectionStore } from 'graphein';

export function RegionControls({ chartSpec, dashboardSpec }) {
  const store = useMemo(() => createSelectionStore(), []);
  const [region, setRegion] = useSelection(store, 'region');

  return (
    <>
      <div className="controls">
        {['West', 'East', 'North', 'South'].map((value) => (
          <button
            key={value}
            aria-pressed={region?.values?.includes(value) ?? false}
            onClick={() => setRegion({ kind: 'set', field: 'region', values: [value] })}
          >
            {value}
          </button>
        ))}
        <button onClick={() => setRegion(null)}>Clear</button>
      </div>
      <Chart spec={chartSpec} store={store} />
      <Dashboard spec={dashboardSpec} store={store} />
    </>
  );
}`;

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="gx-rise p-5 sm:p-6" as="section">
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
        kicker="Using React"
        title="React components, hooks, and shared selections"
        blurb="Use Graphein declaratively with <Chart /> and <Dashboard />, or mount into your own container with hooks when you need instance access."
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <Chip tone="accent">Component-first</Chip>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Give the parent a size, pass a plain spec, and let the wrapper update and destroy safely.
          </p>
        </Card>
        <Card className="p-4">
          <Chip tone="ok">Instance-aware</Chip>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Hooks expose the mounted instance so React can read report(), summarize(), and selection events.
          </p>
        </Card>
        <Card className="p-4">
          <Chip>Shared store</Chip>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Selections are data. Reuse one store to coordinate standalone charts and dashboards.
          </p>
        </Card>
      </div>

      <div className="grid gap-6">
        <Section kicker="01" title="Render a ChartSpec with <Chart spec={...} />">
          <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr] xl:items-stretch">
            <div className="rounded-2xl border border-border bg-surface-2 p-3">
              <div className="h-[390px] rounded-xl border border-border bg-surface p-2">
                <ChartCanvas spec={chartSpec} />
              </div>
            </div>
            <Tabs
              tabs={[
                {
                  id: 'live',
                  label: 'Live',
                  content: (
                    <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-muted">
                      The gallery wrapper above is built on <span className="font-mono text-text">useChart</span>,
                      while the snippet uses the declarative <span className="font-mono text-text">Chart</span>
                      component. Both paths call the same Graphein core renderer.
                    </div>
                  ),
                },
                {
                  id: 'code',
                  label: 'Code',
                  content: <CodeBlock code={chartComponentCode} lang="tsx" title="Chart component" maxHeight={520} />,
                },
              ]}
            />
          </div>
        </Section>

        <Section kicker="02" title="Mount with useChart(spec, { onReady })">
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <h3 className="font-display text-xl font-semibold text-text">Use the hook for instance work.</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                <span className="font-mono text-text">onReady</span> receives the live ChartInstance after
                mount and after updates. Read <span className="font-mono text-text">report()</span> for
                machine-checkable QA, use the report summary for alt text, or hold the instance for imperative
                updates in advanced shells.
              </p>
              <Callout title="Best fit" tone="neutral">
                Ref-based mounting is ideal inside existing card systems, split panes, notebooks, or editors
                where your app owns the container element.
              </Callout>
            </div>
            <CodeBlock code={useChartCode} lang="tsx" title="useChart with report()" maxHeight={520} />
          </div>
        </Section>

        <Section kicker="03" title="Compose dashboards with <Dashboard spec /> and useDashboard">
          <div className="grid gap-5">
            <div className="rounded-2xl border border-border bg-surface-2 p-3">
              <DashboardCanvas spec={dashboardSpec} className="min-h-[760px]" />
            </div>
            <Tabs
              tabs={[
                {
                  id: 'live',
                  label: 'Live',
                  content: (
                    <div className="grid gap-3 text-sm leading-relaxed text-muted md:grid-cols-3">
                      <Card className="p-4">
                        <div className="font-semibold text-text">Auto-wired page</div>
                        <p className="mt-1">Slicers filter every view whose data carries the field.</p>
                      </Card>
                      <Card className="p-4">
                        <div className="font-semibold text-text">Instance API</div>
                        <p className="mt-1">Use d.getSelection(), d.setSelection(), and d.on('selectionchange', fn).</p>
                      </Card>
                      <Card className="p-4">
                        <div className="font-semibold text-text">Same JSON contract</div>
                        <p className="mt-1">DashboardSpec keeps layout, views, and interactions serializable.</p>
                      </Card>
                    </div>
                  ),
                },
                {
                  id: 'code',
                  label: 'Code',
                  content: <CodeBlock code={dashboardCode} lang="tsx" title="Dashboard APIs" maxHeight={620} />,
                },
              ]}
            />
          </div>
        </Section>

        <Section kicker="04" title="Read and write selections with useSelection">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div className="rounded-xl border border-border bg-surface-2 p-4">
              <h3 className="font-display text-xl font-semibold text-text">Selections are plain JSON.</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Create one stable selection store and pass it to every visual that should coordinate. The hook
                returns React state plus a setter; publishing a new value drives cross-filter and cross-highlight
                without callback wiring in the spec itself.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip tone="accent">filter</Chip>
                <Chip tone="accent">highlight</Chip>
                <Chip tone="accent">slicers</Chip>
              </div>
            </div>
            <CodeBlock code={selectionCode} lang="tsx" title="useSelection store" maxHeight={620} />
          </div>
        </Section>

        <Section kicker="05" title="Notes for production React apps">
          <div className="grid gap-4 md:grid-cols-3">
            <Callout title="Plain JSON specs" tone="neutral">
              No functions in a spec. Dates can be Date objects or ISO strings; selections are data too, so
              agents and servers can inspect the whole state.
            </Callout>
            <Callout title="StrictMode-safe" tone="neutral">
              The wrappers mount, destroy, and re-mount cleanly under React StrictMode, avoiding leaked canvases
              or duplicate event handlers.
            </Callout>
            <Callout title="Responsive by default" tone="neutral">
              Charts observe container changes and resize with cards, split panes, dashboards, and theme toggles.
            </Callout>
          </div>
        </Section>
      </div>
    </Page>
  );
}
