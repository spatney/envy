import { Link } from 'react-router-dom';
import { Page, PageHeader } from '../components/ui/Page';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Callout, Card, Chip, Kicker } from '../components/ui/primitives';

const packages = [
  {
    name: 'graphein',
    badge: 'Zero-dependency core',
    purpose:
      'The portable engine for every ChartSpec and DashboardSpec: chart types, validation, repair, rendering, summaries, and render reports.',
    installTitle: 'Install',
    install: 'npm i graphein',
    codeTitle: 'Core loop',
    code: `import { render, renderDashboard, repairSpec, summarize, validateSpec } from 'graphein';

const result = validateSpec(spec);
const ready = result.valid ? spec : repairSpec(spec).spec;

const chart = render('#chart', ready);
const report = chart.report();
const altText = summarize(ready);

renderDashboard('#dashboard', dashboardSpec);`,
    use:
      'Use it whenever an agent, app, notebook, or automation needs a deterministic chart contract without bringing a framework along.',
  },
  {
    name: '@graphein/react',
    badge: 'React integration',
    purpose:
      'A thin React 19 wrapper around the same engine: <Chart>, <Dashboard>, useChart, useDashboard, and useSelection.',
    installTitle: 'Install',
    install: 'npm i @graphein/react',
    codeTitle: 'Component API',
    code: `import { useMemo } from 'react';
import { Chart, Dashboard, useChart, useDashboard, useSelection } from '@graphein/react';
import { createSelectionStore } from 'graphein';

export function RevenueCard({ spec, dashboardSpec }) {
  const store = useMemo(() => createSelectionStore(), []);
  const [region, setRegion] = useSelection(store, 'region');

  return (
    <>
      <Chart spec={spec} store={store} />
      <Dashboard spec={dashboardSpec} store={store} />
    </>
  );
}`,
    use:
      'Use it for product UI, docs, BI pages, and interactive applications that want React lifecycle, StrictMode safety, and shared selections.',
    link: '/react',
    linkLabel: 'Open React guide',
  },
  {
    name: '@graphein/node',
    badge: 'Headless PNG',
    purpose:
      'Server-side rendering via @napi-rs/canvas for reports, CI artifacts, email digests, and export workflows.',
    installTitle: 'Install',
    install: 'npm i @graphein/node',
    codeTitle: 'PNG export',
    code: `import { renderChart, renderToPNG } from '@graphein/node';

const chart = await renderChart(spec, { width: 1200, height: 720 });
const report = chart.report();

await renderToPNG(spec, 'regional-revenue.png', {
  width: 1200,
  height: 720,
});`,
    use:
      'Use it when charts need to be generated offscreen in a job, API route, test runner, or publishing pipeline.',
    link: '/ssr',
    linkLabel: 'Explore SSR',
  },
  {
    name: 'graphein-mcp',
    badge: 'Agent tool surface',
    purpose:
      'An MCP server that exposes validation, repair, rendering critique, API knowledge, and bundled docs as resources.',
    installTitle: 'Run',
    install: 'npx graphein-mcp',
    codeTitle: 'Agent loop',
    code: `// Tools available to an MCP client:
// 1. validate a ChartSpec
// 2. repair safe mistakes
// 3. render headlessly
// 4. read the RenderReport critique
// 5. fetch schema, examples, and docs resources

const fixed = await tools.repairSpec({ spec });
const report = await tools.renderReport({ spec: fixed.spec });`,
    use:
      'Use it when the chart author is an AI agent and you want the schema, docs, examples, repair loop, and visual critique in one protocol.',
    link: '/mcp',
    linkLabel: 'See MCP workflow',
  },
] as const;

function DependencyDiagram() {
  const node = (label: string, note: string, tone?: 'accent') => (
    <div
      className={`rounded-xl border px-4 py-3 text-center shadow-sm ${
        tone === 'accent'
          ? 'border-accent bg-accent-soft text-accent'
          : 'border-border bg-surface text-text'
      }`}
    >
      <div className="font-mono text-sm font-semibold">{label}</div>
      <div className="mt-1 text-xs text-muted">{note}</div>
    </div>
  );

  const arrow = (label: string) => (
    <div className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wide text-faint">
      <span className="h-px w-10 bg-border-strong" />
      <span>{label}</span>
      <span className="h-px w-10 bg-border-strong" />
    </div>
  );

  return (
    <Card className="gx-rise overflow-hidden p-5 sm:p-6" as="section">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Kicker>Mental model</Kicker>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text">
            Install leaves around a dependency-free core.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            The engine remains zero-dep and tree-shakeable. Runtime, native, protocol, and framework
            concerns live only in focused leaf packages.
          </p>
        </div>
        <Chip tone="ok">core stays 0 deps</Chip>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr] lg:items-center">
        {node('graphein', 'render · validate · repair · report', 'accent')}
        {arrow('core ← react')}
        {node('@graphein/react', '<Chart> · hooks')}
        {arrow('core ← node')}
        {node('@graphein/node', 'PNG · headless')}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <div className="rounded-xl border border-border bg-surface-2 p-4 text-sm leading-relaxed text-muted">
          <span className="font-semibold text-text">graphein-mcp</span> composes the core knowledge loop
          with node rendering when an agent needs validation, safe repair, screenshots, critique, and docs.
        </div>
        {arrow('core + node ← mcp')}
        {node('graphein-mcp', 'tools · resources · critique')}
      </div>
    </Card>
  );
}

export function Packages() {
  return (
    <Page wide>
      <PageHeader
        kicker="Packages"
        title="Four packages, one mental model"
        blurb="Start with a plain JSON spec. Add the smallest integration layer needed for React apps, server rendering, or agent tooling."
      />

      <DependencyDiagram />

      <Callout title="The split is intentional" tone="neutral">
        Graphein keeps the core engine zero-dependency. Framework wrappers, native canvas bindings, and
        MCP runtime concerns stay in leaf packages so browser bundles remain lean and predictable.
      </Callout>

      <div className="mt-6 grid gap-5">
        {packages.map((pkg) => (
          <Card key={pkg.name} className="gx-rise p-5 sm:p-6" as="section">
            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl font-semibold tracking-tight text-text">
                    {pkg.name}
                  </h2>
                  <Chip tone="accent">{pkg.badge}</Chip>
                </div>
                <p className="mt-3 text-base leading-relaxed text-muted">{pkg.purpose}</p>
                <div className="mt-5">
                  <CodeBlock code={pkg.install} lang="bash" title={pkg.installTitle} />
                </div>
                <div className="mt-5 rounded-xl border border-border bg-surface-2 p-4">
                  <div className="font-mono text-xs font-semibold uppercase tracking-wide text-faint">
                    When to use it
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{pkg.use}</p>
                  {'link' in pkg && (
                    <Link
                      to={pkg.link}
                      className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline"
                    >
                      {pkg.linkLabel} →
                    </Link>
                  )}
                </div>
              </div>
              <CodeBlock code={pkg.code} lang="tsx" title={pkg.codeTitle} maxHeight={360} />
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
