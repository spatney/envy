import { useMemo, useState } from 'react';
import { repairSpec, validateSpec, type ChartSpec, type RenderReport } from 'graphein';
import { ChartStage } from '../components/chart/ChartStage';
import { ReportPanel } from '../components/chart/ReportPanel';
import { SpecViewer } from '../components/chart/SpecViewer';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Page, PageHeader } from '../components/ui/Page';
import { Tabs } from '../components/ui/Tabs';
import { Card, Callout, Chip, Kicker } from '../components/ui/primitives';
import { categorical, heatmapGrid, timeSeries } from '../content/data';

const ruleData = [
  { month: '2026-01', users: 4200 },
  { month: '2026-02', users: 4650 },
  { month: '2026-03', users: 5010 },
  { month: '2026-04', users: 5480 },
  { month: '2026-05', users: 5920 },
  { month: '2026-06', users: 6410 },
];

const tidyData = [
  { month: 'Jan', region: 'North America', revenue: 138 },
  { month: 'Jan', region: 'Europe', revenue: 96 },
  { month: 'Jan', region: 'Asia Pacific', revenue: 84 },
  { month: 'Feb', region: 'North America', revenue: 151 },
  { month: 'Feb', region: 'Europe', revenue: 112 },
  { month: 'Feb', region: 'Asia Pacific', revenue: 91 },
  { month: 'Mar', region: 'North America', revenue: 168 },
  { month: 'Mar', region: 'Europe', revenue: 125 },
  { month: 'Mar', region: 'Asia Pacific', revenue: 108 },
  { month: 'Apr', region: 'North America', revenue: 184 },
  { month: 'Apr', region: 'Europe', revenue: 138 },
  { month: 'Apr', region: 'Asia Pacific', revenue: 126 },
];

const oneRuleSpec: ChartSpec = {
  type: 'line',
  title: 'Weekly active users',
  data: ruleData,
  encoding: {
    x: { field: 'month', type: 'temporal', title: 'Month' },
    y: { field: 'users', type: 'quantitative', title: 'Active users' },
  },
  insights: true,
};

const tidySpec: ChartSpec = {
  type: 'line',
  title: 'Revenue is split with one series channel',
  data: tidyData,
  encoding: {
    x: { field: 'month', type: 'ordinal' },
    y: { field: 'revenue', type: 'quantitative', title: 'Revenue ($k)' },
    series: { field: 'region', type: 'nominal' },
  },
};

const baseBarSpec: ChartSpec = {
  type: 'bar',
  title: 'Quarterly bookings',
  data: categorical({
    categories: ['Q1', 'Q2', 'Q3', 'Q4'],
    series: ['Product', 'Services', 'Marketplace'],
    base: 210,
    noise: 55,
    seed: 303,
    valueField: 'bookings',
    categoryField: 'quarter',
  }),
  encoding: {
    x: { field: 'quarter', type: 'ordinal' },
    y: { field: 'bookings', type: 'quantitative', title: 'Bookings ($k)' },
  },
};

const seriesBarSpec: ChartSpec = {
  ...baseBarSpec,
  title: 'Adding series reveals the portfolio mix',
  encoding: {
    ...baseBarSpec.encoding,
    series: { field: 'series', type: 'nominal', title: 'Business line' },
  },
};

const colorScatterSpec: ChartSpec = {
  type: 'scatter',
  title: 'Channels can carry extra variables',
  data: [
    { account: 'Aster', adoption: 34, retention: 68, segment: 'Scaleup', seats: 48 },
    { account: 'Beacon', adoption: 58, retention: 81, segment: 'Enterprise', seats: 122 },
    { account: 'Cobalt', adoption: 46, retention: 73, segment: 'Midmarket', seats: 67 },
    { account: 'Delta', adoption: 72, retention: 88, segment: 'Enterprise', seats: 160 },
    { account: 'Ember', adoption: 29, retention: 61, segment: 'Scaleup', seats: 38 },
    { account: 'Fjord', adoption: 64, retention: 77, segment: 'Midmarket', seats: 91 },
    { account: 'Glyph', adoption: 81, retention: 92, segment: 'Enterprise', seats: 210 },
  ],
  encoding: {
    x: { field: 'adoption', type: 'quantitative', title: 'Feature adoption' },
    y: { field: 'retention', type: 'quantitative', title: 'Retention' },
    color: { field: 'segment', type: 'nominal' },
    size: { field: 'seats', type: 'quantitative' },
  },
  trendline: { label: true },
};

const reportSpec: ChartSpec = {
  type: 'bar',
  title: 'Pipeline by stage',
  data: [
    { stage: 'Qualified', value: 1240 },
    { stage: 'Technical win', value: 810 },
    { stage: 'Security review', value: 560 },
    { stage: 'Procurement', value: 390 },
    { stage: 'Closed won', value: 245 },
  ],
  encoding: {
    x: { field: 'stage', type: 'ordinal' },
    y: { field: 'value', type: 'quantitative', title: 'Opportunities' },
  },
  insights: true,
};

const themeSpec: ChartSpec = {
  type: 'area',
  title: 'Same JSON, different presentation',
  data: timeSeries({
    series: ['Observed', 'Forecast'],
    points: 18,
    base: 80,
    trend: 1.5,
    seasonAmp: 10,
    seed: 710,
  }),
  encoding: {
    x: { field: 'date', type: 'temporal' },
    y: { field: 'value', type: 'quantitative' },
    series: { field: 'series', type: 'nominal' },
  },
};

const sketchSpec: ChartSpec = {
  ...themeSpec,
  title: 'Set sketch:true for a hand-drawn rendering',
  sketch: true,
};

const paletteSpec: ChartSpec = {
  type: 'line',
  title: 'OKLab categorical palette: many series, even salience',
  data: timeSeries({
    series: ['North', 'South', 'East', 'West', 'Online'],
    points: 24,
    base: 90,
    trend: 0.9,
    seasonAmp: 14,
    noise: 7,
    seed: 501,
    valueField: 'revenue',
  }),
  encoding: {
    x: { field: 'date', type: 'temporal' },
    y: { field: 'revenue', type: 'quantitative', title: 'Revenue' },
    series: { field: 'series', type: 'nominal' },
  },
};

const heatmapSpec: ChartSpec = {
  type: 'heatmap',
  title: 'OKLab sequential ramp: intensity reads consistently',
  data: heatmapGrid({
    rows: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    cols: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'],
    seed: 908,
  }),
  encoding: {
    x: { field: 'hour', type: 'ordinal' },
    y: { field: 'day', type: 'ordinal' },
    color: { field: 'value', type: 'quantitative', title: 'Activity' },
  },
};

function json(value: unknown) {
  return JSON.stringify(
    value,
    (_key, v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
    2,
  );
}

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="gx-rise space-y-5">
      <div className="max-w-3xl">
        <Kicker>{kicker}</Kicker>
        <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text sm:text-3xl">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {});
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-faint">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-semibold">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((column) => (
                <td key={column} className="px-3 py-2 text-muted">
                  {String(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConceptCard({
  title,
  children,
  tone = 'accent',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'accent' | 'ok' | 'neutral';
}) {
  const toneClass =
    tone === 'ok'
      ? 'border-ok/30 bg-ok/10'
      : tone === 'neutral'
        ? 'border-border bg-surface-2'
        : 'border-accent/30 bg-accent-soft';
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <div className="font-semibold text-text">{title}</div>
      <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

export function Foundations() {
  const [report, setReport] = useState<RenderReport | null>(null);
  const validation = useMemo(() => validateSpec(oneRuleSpec), []);
  const repaired = useMemo(() => repairSpec({ ...oneRuleSpec, type: 'lnie' }), []);

  return (
    <Page wide>
      <PageHeader
        kicker="Foundations"
        title="Think in data, not drawing commands"
        blurb="Graphein is agent-first: emit one tidy JSON object, validate it, render it, then let the chart report back whether it looks right."
      />

      <div className="space-y-12">
        <Section kicker="01 · The one rule" title="A chart is a single JSON-serializable ChartSpec">
          <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="space-y-4 p-5">
              <p className="text-base leading-relaxed text-muted">
                Every Graphein visual starts as data: a <span className="font-mono text-text">type</span>, a flat{' '}
                <span className="font-mono text-text">data[]</span> table, and an{' '}
                <span className="font-mono text-text">encoding</span> that maps columns to visual channels.
                No callbacks, no DOM instructions, no bespoke rendering code.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <ConceptCard title="type">Choose the visual grammar: line, bar, heatmap, sankey, KPI, dashboard, and more.</ConceptCard>
                <ConceptCard title="data[]">Keep rows flat and portable so an agent can inspect, repair, and serialize them.</ConceptCard>
                <ConceptCard title="encoding">Declare what fields mean; Graphein handles scales, axes, legends, marks, and labels.</ConceptCard>
              </div>
              <CodeBlock code={`const chart = render('#app', spec);\nchart.update(nextSpec);\nchart.resize();\nchart.destroy();`} lang="ts" title="runtime contract" />
            </Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <SpecViewer spec={oneRuleSpec} maxHeight={470} />
              <ChartStage spec={oneRuleSpec} height={470} />
            </div>
          </div>
        </Section>

        <Section kicker="02 · Tidy data" title="One row per observation, one column per variable">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="space-y-4 p-5">
              <p className="leading-relaxed text-muted">
                Do not pre-pivot data into separate columns like <span className="font-mono text-text">na_revenue</span>{' '}
                and <span className="font-mono text-text">eu_revenue</span>. Keep one revenue column and split groups
                with <span className="font-mono text-text">encoding.series</span>. That single move keeps tooltips,
                legends, filtering, faceting, and color assignment deterministic.
              </p>
              <Tabs
                tabs={[
                  { id: 'data', label: 'Data', content: <DataTable rows={tidyData.slice(0, 6)} /> },
                  { id: 'spec', label: 'Spec', content: <SpecViewer spec={tidySpec} maxHeight={360} /> },
                  { id: 'code', label: 'Code', content: <CodeBlock code={`encoding: {\n  x: { field: 'month', type: 'ordinal' },\n  y: { field: 'revenue', type: 'quantitative' },\n  series: { field: 'region', type: 'nominal' }\n}`} lang="ts" title="split groups with series" /> },
                ]}
              />
            </Card>
            <ChartStage spec={tidySpec} height={520} />
          </div>
        </Section>

        <Section kicker="03 · Encoding & channels" title="Change the mapping, change the story">
          <div className="grid gap-5 lg:grid-cols-3">
            <Card className="space-y-4 p-5 lg:col-span-1">
              <p className="leading-relaxed text-muted">
                Channels are named slots: <span className="font-mono text-text">x</span>,{' '}
                <span className="font-mono text-text">y</span>, <span className="font-mono text-text">series</span>,{' '}
                <span className="font-mono text-text">color</span>, and <span className="font-mono text-text">size</span>.
                Field types tell Graphein which scale to build: quantitative, temporal, nominal, or ordinal.
              </p>
              <CodeBlock code={`type FieldDef = {\n  field: string;\n  type?: 'quantitative' | 'temporal' | 'nominal' | 'ordinal';\n  title?: string;\n  format?: string;\n};`} lang="ts" title="field definition" />
            </Card>
            <div className="space-y-3 lg:col-span-2">
              <Tabs
                tabs={[
                  { id: 'plain', label: 'x + y', content: <ChartStage spec={baseBarSpec} height={380} /> },
                  { id: 'series', label: '+ series', content: <ChartStage spec={seriesBarSpec} height={380} /> },
                  { id: 'color-size', label: 'color + size', content: <ChartStage spec={colorScatterSpec} height={380} /> },
                ]}
              />
              <CodeBlock code={`// Add one channel; the same rows become grouped marks.\nencoding: {\n  x: { field: 'quarter', type: 'ordinal' },\n  y: { field: 'bookings', type: 'quantitative' },\n  series: { field: 'series', type: 'nominal' }\n}`} lang="ts" title="encoding change" />
            </div>
          </div>
        </Section>

        <Section kicker="04 · Validate → render" title="Make correctness a cheap, pure step">
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <Card className="space-y-4 p-5">
              <p className="leading-relaxed text-muted">
                <span className="font-mono text-text">validateSpec(spec)</span> returns structural errors and advisory
                warnings before rendering. Findings can carry a JSON Patch <span className="font-mono text-text">fix</span>{' '}
                and human <span className="font-mono text-text">suggestion</span>;{' '}
                <span className="font-mono text-text">repairSpec(spec)</span> applies only safe, unambiguous fixes.
              </p>
              <div className="flex flex-wrap gap-2">
                <Chip tone={validation.valid ? 'ok' : 'err'}>{validation.valid ? 'valid spec' : 'invalid spec'}</Chip>
                <Chip>{validation.errors.length} errors</Chip>
                <Chip>{validation.warnings.length} warnings</Chip>
                <Chip tone={repaired.remaining.length === 0 ? 'ok' : 'warn'}>{repaired.applied.length} repair patch</Chip>
              </div>
              <CodeBlock code={`import { validateSpec, repairSpec, render } from 'graphein';\n\nconst result = validateSpec(spec);\nif (!result.valid) {\n  const repaired = repairSpec(spec);\n}\n\nconst chart = render(container, spec);`} lang="ts" title="agent loop" />
            </Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <CodeBlock code={json(validation)} lang="json" title="live validateSpec(oneRuleSpec)" maxHeight={430} />
              <CodeBlock code={json({ applied: repaired.applied, remaining: repaired.remaining })} lang="json" title="live repairSpec({ type: 'lnie' })" maxHeight={430} />
            </div>
          </div>
        </Section>

        <Section kicker="05 · Report + summarize()" title="The chart can critique and describe itself">
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <ChartStage spec={reportSpec} height={500} onReport={(info) => setReport(info.report)} />
            <Card className="space-y-4 p-5">
              <p className="leading-relaxed text-muted">
                After render, <span className="font-mono text-text">chart.report()</span> returns a vision-free diagnostic:
                mark count, series count, color count, clipped labels, legend overflow, contrast issues, and axis problems.
                <span className="font-mono text-text"> summarize(spec)</span> produces deterministic plain English that also
                works as alt-text—no LLM needed at runtime.
              </p>
              <ReportPanel report={report} />
              <CodeBlock code={`const report = chart.report();\n// { ok, markCount, diagnostics, summary, ... }\n\nconst alt = summarize(spec);`} lang="ts" title="self-critique loop" />
            </Card>
          </div>
        </Section>

        <Section kicker="06 · Themes & sketch" title="Presentation changes without changing data shape">
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <Card className="space-y-4 p-5">
              <p className="leading-relaxed text-muted">
                The global theme toggle swaps Graphein between polished light and dark palettes. For exploratory notebooks
                or narrative sketches, add <span className="font-mono text-text">sketch:true</span> to the same spec for a
                hand-drawn aesthetic while preserving the exact same data and encoding.
              </p>
              <Callout title="Try it live">
                Use the top-bar theme and sketch controls: the same ChartSpec is re-rendered through the gallery shell with
                no page-specific CSS or chart-specific branching.
              </Callout>
              <CodeBlock code={`const sketchSpec = {\n  ...spec,\n  sketch: true\n};`} lang="ts" title="hand-drawn mode" />
            </Card>
            <div className="grid gap-5 xl:grid-cols-2">
              <ChartStage spec={themeSpec} height={430} />
              <ChartStage spec={sketchSpec} height={430} />
            </div>
          </div>
        </Section>

        <Section kicker="07 · OKLab color engine" title="Color ramps that stay honest to the eye">
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="space-y-4 p-5">
              <p className="leading-relaxed text-muted">
                Graphein derives categorical palettes and sequential ramps in OKLab, a perceptual color space. Equal steps
                are closer to equal visual differences, so no region looks artificially important because its hue is louder,
                and heatmap intensity reads as data rather than decoration.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <ConceptCard title="Categorical" tone="neutral">
                  Multi-series charts get distinct colors with balanced contrast across light and dark themes.
                </ConceptCard>
                <ConceptCard title="Sequential" tone="neutral">
                  Quantitative color ramps progress smoothly, helping low, middle, and high values remain comparable.
                </ConceptCard>
              </div>
              <CodeBlock code={`encoding: {\n  series: { field: 'region', type: 'nominal' },\n  color: { field: 'value', type: 'quantitative' }\n}`} lang="ts" title="palette selection follows field type" />
            </Card>
            <div className="space-y-5">
              <ChartStage spec={paletteSpec} height={360} />
              <ChartStage spec={heatmapSpec} height={360} />
            </div>
          </div>
        </Section>
      </div>
    </Page>
  );
}
