import { useMemo, useState } from 'react';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Page, PageHeader } from '../components/ui/Page';
import {
  ButtonLink,
  Callout,
  Card,
  Chip,
  SectionHeader,
  SpectrumBar,
} from '../components/ui/primitives';

const chartTypes = [
  { type: 'line', group: 'Cartesian', required: 'encoding.x, encoding.y', optional: 'series, points, area, trendline, facet', purpose: 'Time or continuous series; multi-series through series.' },
  { type: 'area', group: 'Cartesian', required: 'encoding.x, encoding.y', optional: 'series, stack, trendline, facet', purpose: 'Filled trends; stack series for part-to-whole over time.' },
  { type: 'bar', group: 'Cartesian', required: 'encoding.x, encoding.y', optional: 'series, stack, group, orientation, facet', purpose: 'Category comparison with grouped or stacked bars.' },
  { type: 'scatter', group: 'Cartesian', required: 'encoding.x, encoding.y', optional: 'size, series, trendline, facet', purpose: 'Points and bubbles for correlation or distribution.' },
  { type: 'combo', group: 'Cartesian', required: 'encoding.x, layers[].encoding.y', optional: 'bar/line/area/scatter layers, left/right axes', purpose: 'Layered BI chart, commonly bars plus a line on shared x.' },
  { type: 'histogram', group: 'Distribution', required: 'encoding.x', optional: 'bin, density, color, cornerRadius', purpose: 'Bins one quantitative field inside the chart.' },
  { type: 'pie', group: 'Part-to-whole', required: 'encoding.theta, encoding.color', optional: 'donut, labels', purpose: 'Pie or donut; values are summed per slice.' },
  { type: 'heatmap', group: 'Matrix', required: 'encoding.x, encoding.y, encoding.color', optional: 'scheme', purpose: 'Category by category grid colored by a numeric measure.' },
  { type: 'box', group: 'Distribution', required: 'encoding.x, encoding.y', optional: 'series, whisker, outliers', purpose: 'Quartiles, median, whiskers, and outliers from raw rows.' },
  { type: 'funnel', group: 'Flow', required: 'encoding.stage, encoding.value', optional: 'labels, percent', purpose: 'Conversion stages; values are summed per stage.' },
  { type: 'sankey', group: 'Flow', required: 'encoding.source, encoding.target, encoding.value', optional: 'nodeWidth, nodePadding, nodeValues', purpose: 'Weighted links between derived nodes.' },
  { type: 'choropleth', group: 'Geo', required: 'geo, encoding.key, encoding.color', optional: 'featureId, projection, scheme', purpose: 'GeoJSON regions shaded by a joined data value.' },
  { type: 'treemap', group: 'Hierarchy', required: 'encoding.category, encoding.value', optional: 'group, color, scheme, labels', purpose: 'Nested rectangles sized by measure; one optional parent level.' },
  { type: 'gauge', group: 'KPI', required: 'value, max', optional: 'min, target, bands, label, format', purpose: 'Radial value against a scale with optional target and bands.' },
  { type: 'bullet', group: 'KPI', required: 'value', optional: 'target, ranges, min/max, label, format', purpose: 'Compact KPI versus target and qualitative ranges.' },
  { type: 'calendarHeatmap', group: 'Time', required: 'encoding.date, encoding.color', optional: 'scheme', purpose: 'One cell per day, colored by value.' },
  { type: 'waterfall', group: 'Finance', required: 'encoding.stage, encoding.value', optional: 'totals, showTotal, labels, colors', purpose: 'Running total bridge from signed deltas.' },
  { type: 'slope', group: 'Change', required: 'encoding.x, encoding.y, encoding.series', optional: 'colorByChange, labels, format', purpose: 'Before/after or rank-change lines with direct labels.' },
  { type: 'dumbbell', group: 'Change', required: 'encoding.category, encoding.value, encoding.group', optional: 'sort, labels, format', purpose: 'Connected dots showing gaps between two or more groups.' },
  { type: 'kpi', group: 'KPI', required: 'value', optional: 'label, delta, format, sparkline', purpose: 'Single metric card with optional delta and sparkline.' },
  { type: 'table', group: 'Tabular', required: 'data', optional: 'columns, sort, density, totals, stickyHeader', purpose: 'Virtualized sortable table with column formatting.' },
  { type: 'matrix', group: 'Tabular', required: 'rows, values', optional: 'columns, subtotals, grandTotals, showAs', purpose: 'Pivot/cross-tab over hierarchical rows, columns, and measures.' },
] as const;

type ChartType = (typeof chartTypes)[number];

const slicers = [
  { type: 'dropdown', required: 'field', optional: 'multiple, placeholder', purpose: 'Single or multi-select set selection.' },
  { type: 'search', required: 'field', optional: 'placeholder, debounce', purpose: 'Debounced text contains selection.' },
  { type: 'list', required: 'field', optional: 'selectAll, searchThreshold', purpose: 'Scrollable checkbox set selection.' },
  { type: 'range', required: 'field', optional: 'min, max, step, format', purpose: 'Numeric min/max range selection.' },
  { type: 'dateRange', required: 'field', optional: 'presets, format', purpose: 'Temporal range selection with relative presets.' },
] as const;

const foundations = [
  ['BaseSpec', 'Every chart can carry title, dimensions, theme, transforms, annotations, params, highlight, and filter.'],
  ['Encoding', 'Charts map tidy data columns to channels with FieldDef objects: x, y, series, color, size, theta, source, target, value, and more.'],
  ['Transforms', 'Aggregate, bin, filter, fold, timeUnit, and calculate shape data inside the validatable spec.'],
  ['Runtime API', 'render(), renderDashboard(), validateSpec(), repairSpec(), summarize(), chart.update(), chart.resize(), chart.destroy(), chart.report().'],
] as const;

const minimalSpec = `import { repairSpec, render, validateSpec } from 'graphein';

const spec = {
  type: 'bar',
  data: [
    { region: 'North', sales: 418000 },
    { region: 'South', sales: 362000 },
    { region: 'West', sales: 509000 },
  ],
  encoding: {
    x: { field: 'region', type: 'nominal' },
    y: { field: 'sales', type: 'quantitative', format: '$,.0f' },
  },
  title: 'Revenue by region',
};

const checked = validateSpec(spec);
const ready = checked.valid ? spec : repairSpec(spec).spec;
const chart = render('#chart', ready);
console.log(chart.report());`;

const dashboardShape = `{
  "type": "dashboard",
  "data": [
    { "month": "2026-01", "region": "West", "sales": 420000 },
    { "month": "2026-02", "region": "West", "sales": 465000 }
  ],
  "views": [
    { "id": "region", "spec": { "type": "dropdown", "field": "region" }, "w": 3, "h": 2 },
    { "id": "trend", "spec": { "type": "line", "encoding": { "x": { "field": "month" }, "y": { "field": "sales" } } }, "w": 9, "h": 3 }
  ],
  "layout": { "cols": 12, "rowHeight": 96, "sections": [{ "title": "Overview", "views": ["region", "trend"] }] },
  "interactions": "auto"
}`;

export function Reference() {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!normalized) return chartTypes;
    return chartTypes.filter((item) =>
      [item.type, item.group, item.required, item.optional, item.purpose].some((value) =>
        value.toLowerCase().includes(normalized),
      ),
    );
  }, [normalized]);

  const grouped = useMemo<Record<string, ChartType[]>>(() => {
    const acc: Record<string, ChartType[]> = {};
    filtered.forEach((item) => {
      acc[item.group] ??= [];
      acc[item.group].push(item);
    });
    return acc;
  }, [filtered]);

  return (
    <Page wide>
      <PageHeader
        kicker="Reference"
        title="ChartSpec Reference for Humans"
        blurb="A map of the generated JSON Schema and docs/spec-reference.md: required fields, channel locations, slicers, dashboards, and related guides."
      />

      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="p-5 sm:p-6" as="section">
          <SectionHeader
            eyebrow="Contract"
            title="One Discriminated JSON Object"
            lead="The schema is generated from the TypeScript spec types and discriminates on type. It covers chart specs, slicers, and dashboards; the markdown reference provides field notes and examples."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="font-display text-2xl font-semibold text-text">22</div>
              <div className="text-xs uppercase tracking-wide text-faint">chart types</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="font-display text-2xl font-semibold text-text">5</div>
              <div className="text-xs uppercase tracking-wide text-faint">slicers</div>
            </div>
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <div className="font-display text-2xl font-semibold text-text">1</div>
              <div className="text-xs uppercase tracking-wide text-faint">dashboard spec</div>
            </div>
          </div>
          <SpectrumBar className="mt-5" />
        </Card>

        <CodeBlock code={minimalSpec} lang="ts" title="Core spec loop" maxHeight={430} />
      </div>

      <div className="mt-7 grid gap-5 lg:grid-cols-4">
        {foundations.map(([title, copy], index) => (
          <Card key={title} className="p-4">
            <div className={`mb-3 h-1.5 w-12 rounded-full spec-${index + 1}`} />
            <h3 className="font-display text-lg font-semibold text-text">{title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{copy}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-7 p-5 sm:p-6" as="section">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <SectionHeader
            eyebrow="Chart types"
            title="Required Channels and Key Options"
            lead="Search by chart type, family, channel, or option. Required fields are copied from the spec reference."
          />
          <label className="w-full md:w-80">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-faint">
              Search reference
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="line, geo, encoding.value…"
              className="w-full rounded-xl border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text outline-none transition placeholder:text-faint focus:border-accent"
            />
          </label>
        </div>

        <div className="mt-6 grid gap-5">
          {Object.entries(grouped).map(([group, items]) => (
            <section key={group}>
              <div className="mb-3 flex items-center gap-3">
                <Chip tone="accent">{group}</Chip>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((item) => (
                  <article key={item.type} className="rounded-2xl border border-border bg-surface-2 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-mono text-base font-semibold text-text">{item.type}</h3>
                      <Chip>{item.group}</Chip>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{item.purpose}</p>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                          Required
                        </dt>
                        <dd className="mt-1 font-mono text-xs text-text">{item.required}</dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-faint">
                          Common options
                        </dt>
                        <dd className="mt-1 font-mono text-xs text-muted">{item.optional}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {filtered.length === 0 && (
            <Callout title="No matches" tone="neutral">
              Try a chart type, channel name, or family such as{' '}
              <span className="font-mono text-text">encoding.value</span>,{' '}
              <span className="font-mono text-text">geo</span>, or{' '}
              <span className="font-mono text-text">KPI</span>.
            </Callout>
          )}
        </div>
      </Card>

      <div className="mt-7 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5 sm:p-6" as="section">
          <SectionHeader
            eyebrow="Slicers"
            title="Controls Are Specs Too"
            lead="Slicers publish JSON selections. Dashboards can auto-wire them to charts that share the same field."
          />
          <div className="mt-5 grid gap-3">
            {slicers.map((item) => (
              <div key={item.type} className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-text">{item.type}</span>
                  <Chip>requires {item.required}</Chip>
                </div>
                <p className="mt-2 text-sm text-muted">{item.purpose}</p>
                <p className="mt-1 font-mono text-xs text-faint">{item.optional}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5 sm:p-6" as="section">
          <SectionHeader
            eyebrow="Dashboards"
            title="One Page, One Selection Store"
            lead="A dashboard spec owns shared data, placed views, layout sections, and interactions. validateSpec validates dashboards too."
          />
          <div className="mt-5">
            <CodeBlock code={dashboardShape} lang="json" title="Dashboard shape" maxHeight={430} />
          </div>
        </Card>
      </div>

      <Callout title="Deep sources" tone="neutral">
        The authoritative files are <span className="font-mono text-text">docs/spec-reference.md</span>{' '}
        and <span className="font-mono text-text">docs/chart-spec.schema.json</span>. The MCP
        package also serves them as <span className="font-mono text-text">graphein://spec-reference</span>{' '}
        and <span className="font-mono text-text">graphein://schema</span> resources.
      </Callout>

      <div className="mt-6 flex flex-wrap gap-3">
        <ButtonLink to="/learn" variant="outline">
          Read Learn Track
        </ButtonLink>
        <ButtonLink to="/playground" variant="spectrum">
          Open Playground
        </ButtonLink>
        <ButtonLink
          to="https://github.com/spatney/graphein/blob/main/docs/spec-reference.md"
          external
          variant="ghost"
        >
          Spec reference source →
        </ButtonLink>
      </div>
    </Page>
  );
}
