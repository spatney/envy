import type { ChartSpec, DashboardSpec } from 'graphein';
import { DashboardCanvas } from '../components/chart/DashboardCanvas';
import { ChartCanvas } from '../components/chart/ChartCanvas';
import { Page, PageHeader } from '../components/ui/Page';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Tabs } from '../components/ui/Tabs';
import { Card, Chip, Kicker } from '../components/ui/primitives';
import {
  dashboardDemo,
  interactiveData,
  salesByRegionProduct,
  slicerSpecs,
} from '../content/interactive';

const selectionCode = `const salesByRegion: ChartSpec = {
  type: 'bar',
  data: salesByRegionProduct(),
  encoding: { x: { field: 'region' }, y: { field: 'sales' } },
  params: [{ name: 'pickedRegion', select: { type: 'point', on: 'click', fields: ['region'] } }],
};

const trend: ChartSpec = {
  type: 'line',
  data: interactiveData(),
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'sales' },
    series: { field: 'region' },
  },
  filter: [{ param: 'pickedRegion' }],
};

// Dashboards share one selection store, so the click above updates the line.
const dashboard: DashboardSpec = {
  type: 'dashboard',
  views: [{ id: 'source', spec: salesByRegion }, { id: 'trend', spec: trend }],
};`;

const hooksCode = `import { useMemo, useState } from 'react';
import { createSelectionStore, type DashboardInstance } from 'graphein';
import { Chart, Dashboard, useChart, useDashboard, useSelection } from '@graphein/react';

function CoordinatedWorkspace({ chartSpec, dashboardSpec }) {
  const store = useMemo(() => createSelectionStore(), []);
  const [dashboard, setDashboard] = useState<DashboardInstance | null>(null);
  const [region, setRegion] = useSelection(store, 'region');

  const chartRef = useChart(chartSpec, {
    store,
    onReady: (chart) => console.log(chart.report().summary),
  });

  const dashboardRef = useDashboard(dashboardSpec, {
    store,
    onReady: setDashboard,
    onSelectionChange: (name, value) => console.log('selectionchange', name, value),
  });

  function focusWest() {
    setRegion({ kind: 'set', field: 'region', values: ['West'] });
    dashboard?.setSelection('product', { kind: 'set', field: 'product', values: ['Widgets'] });
  }

  function inspect() {
    console.log(region);
    console.log(dashboard?.getSelection());
    const off = dashboard?.on('selectionchange', (name, value) => console.log(name, value));
    return off?.();
  }

  return (
    <>
      <Chart spec={chartSpec} store={store} />
      <Dashboard spec={dashboardSpec} store={store} />
      <div ref={chartRef} />
      <div ref={dashboardRef} />
      <button onClick={focusWest}>Filter West</button>
      <button onClick={inspect}>Inspect store</button>
    </>
  );
}`;

const slicerNoteCode = (field: string) => `{
  "type": "line",
  "encoding": {
    "x": { "field": "month", "type": "temporal" },
    "y": { "field": "sales" },
    "series": { "field": "region" }
  },
  "filter": [{ "param": "${field}" }]
}`;

const miniDashboardSpec: DashboardSpec = {
  type: 'dashboard',
  title: 'Click-to-filter: region command surface',
  subtitle: 'Pick a region in the stacked bar; the trend and product mix recompute from the shared selection.',
  data: interactiveData(),
  layout: {
    cols: 12,
    density: 'standard',
    maxWidth: 1120,
    padding: 14,
    sections: [
      {
        id: 'flow',
        title: 'One selection store',
        subtitle: 'The source chart publishes a region; target views consume it as a filter.',
        views: ['source', 'trend', 'mix'],
      },
    ],
  },
  views: [
    {
      id: 'source',
      title: 'Source: click a region',
      subtitle: 'Publishes pickedRegion',
      spec: {
        type: 'bar',
        data: salesByRegionProduct(),
        encoding: {
          x: { field: 'region' },
          y: { field: 'sales', title: 'Sales' },
          series: { field: 'product' },
        },
        stack: true,
      },
      w: 4,
      h: 4,
      responsive: [{ maxWidth: 900, w: 12, h: 4 }],
    },
    {
      id: 'trend',
      title: 'Target: filtered trend',
      subtitle: 'Consumes filter:[{param:"pickedRegion"}]',
      spec: {
        type: 'line',
        encoding: {
          x: { field: 'month', type: 'temporal' },
          y: { field: 'sales', title: 'Sales' },
          series: { field: 'region' },
        },
      },
      w: 5,
      h: 4,
      responsive: [{ maxWidth: 900, w: 12, h: 4 }],
    },
    {
      id: 'mix',
      title: 'Target: filtered product mix',
      subtitle: 'Same param, different mark',
      spec: {
        type: 'pie',
        donut: true,
        encoding: {
          theta: { field: 'sales', aggregate: 'sum' },
          color: { field: 'product' },
        },
      },
      w: 3,
      h: 4,
      responsive: [{ maxWidth: 900, w: 12, h: 4 }],
    },
  ],
  interactions: [{ source: 'source', target: ['trend', 'mix'], as: 'filter', fields: ['region'] }],
};

const slicers = slicerSpecs().map((item) => ({
  ...item,
  liveSpec: item.spec(),
}));

const dashboard = dashboardDemo();

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function SectionTitle({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl">
      <Kicker>{kicker}</Kicker>
      <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-text">{title}</h2>
      <p className="mt-2 leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function SlicerCard({
  title,
  spec,
}: {
  title: string;
  spec: ChartSpec;
}) {
  const field = 'field' in spec && typeof spec.field === 'string' ? spec.field : 'region';
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border bg-surface-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-lg font-semibold text-text">{title}</h3>
            <p className="mt-1 text-sm text-muted">
              Publishes <span className="font-mono text-accent">{field}</span> unless you set a custom param.
            </p>
          </div>
          <Chip tone="accent">{spec.type}</Chip>
        </div>
      </div>
      <Tabs
        tabs={[
          {
            id: 'live',
            label: 'Live',
            content: (
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(260px,0.9fr)_1.1fr]">
                <div className="rounded-xl border border-border bg-surface p-3">
                  <ChartCanvas spec={spec} className="min-h-44" style={{ minHeight: 176 }} />
                </div>
                <div className="space-y-3">
                  <p className="text-sm leading-relaxed text-muted">
                    This slicer writes a JSON selection to the dashboard store. Any view whose spec
                    includes <span className="font-mono text-text">filter:[{'{'}param:'{field}'{'}'}]</span>
                    automatically subsets rows to the chosen values, query, or range.
                  </p>
                  <CodeBlock code={slicerNoteCode(field)} lang="json" title="consumer chart" maxHeight={190} />
                </div>
              </div>
            ),
          },
          {
            id: 'code',
            label: 'Spec',
            content: (
              <div className="p-4">
                <CodeBlock code={pretty(spec)} lang="json" title={`${title} spec`} maxHeight={330} />
              </div>
            ),
          },
        ]}
        stripClassName="mx-4 mt-4"
      />
    </Card>
  );
}

export function Interactivity() {
  return (
    <Page wide>
      <PageHeader
        kicker="Interactivity"
        title="Selections, slicers, and dashboards that wire themselves"
        blurb="Graphein treats interaction as serializable data: charts publish params, other views consume them as highlights or filters, and dashboards coordinate the whole analytical surface."
      />

      <div className="space-y-10">
        <section className="gx-rise">
          <Card className="overflow-hidden">
            <div className="grid gap-6 p-5 lg:grid-cols-[0.95fr_1.05fr] lg:p-6">
              <div className="space-y-4">
                <div>
                  <Kicker>Selections are data</Kicker>
                  <h2 className="mt-1 font-display text-2xl font-semibold text-text">
                    Publish once. Consume everywhere.
                  </h2>
                </div>
                <p className="leading-relaxed text-muted">
                  A selection is just JSON in a named store. <span className="font-mono text-text">params</span>{' '}
                  define what a visual publishes; <span className="font-mono text-text">highlight</span>{' '}
                  dims non-matching marks; <span className="font-mono text-text">filter</span> recomputes
                  downstream views from the selected rows.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="font-mono text-xs font-semibold text-accent">params</div>
                    <p className="mt-1 text-sm text-muted">Named point or interval selections written by clicks, brushes, and slicers.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="font-mono text-xs font-semibold text-accent">highlight</div>
                    <p className="mt-1 text-sm text-muted">Keep all data visible while emphasizing rows matching a param.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-2 p-3">
                    <div className="font-mono text-xs font-semibold text-accent">filter</div>
                    <p className="mt-1 text-sm text-muted">Subset each consumer by every clause, including named params and literals.</p>
                  </div>
                </div>
                <CodeBlock code={selectionCode} title="minimal coordination pattern" maxHeight={360} />
              </div>
              <div className="rounded-2xl border border-border bg-surface-2 p-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Chip tone="accent">Live dashboard</Chip>
                  <span className="text-sm text-muted">Click a stacked bar segment to filter the trend and donut.</span>
                </div>
                <DashboardCanvas spec={miniDashboardSpec} className="min-h-[540px]" />
              </div>
            </div>
          </Card>
        </section>

        <section className="space-y-5 gx-rise" style={{ '--d': '80ms' } as React.CSSProperties}>
          <SectionTitle kicker="The five slicers" title="First-class controls, not custom widgets">
            Dropdown, checkbox list, search, numeric range, and date range all render through the same
            chart runtime. Each one reads a field, publishes a param, and auto-connects to compatible
            consumer filters inside a dashboard.
          </SectionTitle>
          <div className="grid gap-5 xl:grid-cols-2">
            {slicers.map((item) => (
              <SlicerCard key={item.id} title={item.title} spec={item.liveSpec} />
            ))}
          </div>
        </section>

        <section className="space-y-5 gx-rise" style={{ '--d': '140ms' } as React.CSSProperties}>
          <SectionTitle kicker="Auto-wired dashboard" title="The centerpiece: a complete BI page from one JSON object">
            The dashboard shares one dataset and one selection store. Navigator slicers cross-filter every
            view, click-able charts cross-highlight shared fields, layout sections add page structure, and
            per-view chrome keeps the experience polished without callbacks.
          </SectionTitle>
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-surface-2 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl font-semibold text-text">Regional revenue cockpit</h3>
                  <p className="mt-1 text-sm text-muted">
                    Try the top slicers, then click a region bar or product slice to see coordinated filtering and highlighting.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Chip tone="accent">interactions:'auto'</Chip>
                  <Chip>sections</Chip>
                  <Chip>shared store</Chip>
                </div>
              </div>
            </div>
            <Tabs
              tabs={[
                {
                  id: 'live',
                  label: 'Live',
                  content: (
                    <div className="gx-stage p-3 sm:p-5">
                      <DashboardCanvas spec={dashboard} className="min-h-[960px]" />
                    </div>
                  ),
                },
                {
                  id: 'code',
                  label: 'Code',
                  content: (
                    <div className="p-4">
                      <CodeBlock code="const spec = dashboardDemo();" title="source" />
                      <CodeBlock
                        code={pretty({
                          type: dashboard.type,
                          layout: dashboard.layout,
                          interactions: dashboard.interactions,
                          views: dashboard.views.map((view) => ({
                            id: view.id,
                            title: view.title,
                            w: view.w,
                            h: view.h,
                            spec: view.spec,
                          })),
                        })}
                        lang="json"
                        title="dashboard shape"
                        className="mt-4"
                        maxHeight={560}
                      />
                    </div>
                  ),
                },
              ]}
              stripClassName="mx-4 mt-4"
            />
          </Card>
        </section>

        <section className="space-y-5 gx-rise" style={{ '--d': '200ms' } as React.CSSProperties}>
          <SectionTitle kicker="React hooks" title="Drive the selection store from React when you need to">
            The declarative specs cover most dashboards. For bespoke controls, mount the runtime with hooks,
            pass a shared store, read or write named params with <span className="font-mono">useSelection</span>,
            and subscribe to <span className="font-mono">selectionchange</span>.
          </SectionTitle>
          <CodeBlock code={hooksCode} title="useChart · useDashboard · useSelection" maxHeight={620} />
        </section>
      </div>
    </Page>
  );
}
