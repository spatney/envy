import { CodeBlock } from '../components/ui/CodeBlock';
import { Page, PageHeader } from '../components/ui/Page';
import {
  ButtonLink,
  Callout,
  Card,
  Chip,
  Kicker,
  SectionHeader,
  SpectrumBar,
} from '../components/ui/primitives';

const packageCards = [
  {
    name: 'graphein',
    accent: 'spec-1',
    badge: 'core engine · zero dependencies',
    install: 'npm i graphein',
    purpose:
      'The framework-agnostic runtime. It validates and repairs ChartSpecs, renders charts and dashboards, returns summaries, and exposes RenderReport diagnostics.',
    facts: ['render()', 'validateSpec()', 'repairSpec()', 'summarize()', 'chart.report()'],
    codeTitle: 'Validate → repair → render → report',
    code: `import { render, repairSpec, summarize, validateSpec } from 'graphein';

const result = validateSpec(spec);
const ready = result.valid ? spec : repairSpec(spec).spec;

const chart = render('#chart', ready);
console.log(summarize(ready));
console.log(chart.report());

chart.update(nextSpec);
chart.resize();
chart.destroy();`,
  },
  {
    name: '@graphein/react',
    accent: 'spec-2',
    badge: 'React components + hooks',
    install: 'npm i @graphein/react react',
    purpose:
      'A thin React wrapper around the core renderer. Use <Chart /> and <Dashboard /> for declarative mounting, or useChart/useDashboard when the app owns the container.',
    facts: ['<Chart spec />', '<Dashboard spec />', 'useChart()', 'useDashboard()', 'useSelection()'],
    codeTitle: 'Component API',
    code: `import { Chart, Dashboard } from '@graphein/react';

export function RevenuePage({ chartSpec, dashboardSpec }) {
  return (
    <>
      <div style={{ height: 360 }}>
        <Chart spec={chartSpec} />
      </div>
      <Dashboard spec={dashboardSpec} />
    </>
  );
}`,
    link: '/react',
    linkLabel: 'React guide',
  },
  {
    name: '@graphein/node',
    accent: 'spec-3',
    badge: 'headless PNG',
    install: 'npm i @graphein/node graphein',
    purpose:
      'Server-side rendering for canvas-backed charts via @napi-rs/canvas. It returns PNG bytes plus the same RenderReport used by the browser runtime.',
    facts: ['renderChart()', 'renderToPNG()', '@napi-rs/canvas', 'PNG Buffer'],
    codeTitle: 'Render in Node',
    code: `import { renderChart, renderToPNG } from '@graphein/node';
import { writeFileSync } from 'node:fs';

const { png, report } = renderChart(spec, {
  width: 1200,
  height: 720,
  dpr: 2,
});

if (!report.ok) console.warn(report.diagnostics);
writeFileSync('regional-revenue.png', png);

const compact = renderToPNG(spec, { width: 640, height: 360 });`,
    link: '/ssr',
    linkLabel: 'SSR guide',
  },
  {
    name: 'graphein-mcp',
    accent: 'spec-4',
    badge: 'MCP server',
    install: 'npx -y graphein-mcp',
    purpose:
      'A Model Context Protocol server for agent-first chart building. It exposes render, validate, repair, and summarize tools, and serves the schema plus docs as resources.',
    facts: ['render_chart', 'validate_chart', 'repair_chart', 'summarize_chart', 'docs resources'],
    codeTitle: 'MCP client config',
    code: `{
  "mcpServers": {
    "graphein": {
      "command": "npx",
      "args": ["-y", "graphein-mcp"]
    }
  }
}`,
    link: '/mcp',
    linkLabel: 'MCP workflow',
  },
] as const;

function MentalModel() {
  return (
    <Card className="overflow-hidden p-0" as="section">
      <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="bg-surface-2 p-6 sm:p-7">
          <Kicker>Mental model</Kicker>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text sm:text-3xl">
            Emit One ChartSpec. Add Only the Package Boundary You Need.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">
            Graphein keeps the grammar, validation, repairSpec(), renderer, summaries, and reports in the zero-dependency core. React, native canvas, and protocol code live in leaf packages.
          </p>
          <SpectrumBar className="mt-6" />
        </div>
        <div className="grid gap-3 p-6 sm:grid-cols-2 sm:p-7">
          {[
            ['graphein', 'ChartSpec + renderer + render → report loop'],
            ['@graphein/react', 'React lifecycle around the same renderer'],
            ['@graphein/node', 'PNG bytes and RenderReport in Node'],
            ['graphein-mcp', 'Agent tools plus schema and docs resources'],
          ].map(([name, note], index) => (
            <div key={name} className="rounded-2xl border border-border bg-surface p-4">
              <div className={`mb-3 h-1.5 w-14 rounded-full spec-${index + 1}`} />
              <div className="font-mono text-sm font-semibold text-text">{name}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{note}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function Packages() {
  return (
    <Page wide>
      <PageHeader
        kicker="Packages"
        title="Four Packages, One ChartSpec Contract"
        blurb="Start with Graphein's zero-dependency core. Add React for UI, Node for PNG export, or MCP for agent-authored charts."
      />

      <MentalModel />

      <div className="mt-7 grid gap-5 lg:grid-cols-2">
        {packageCards.map((pkg) => (
          <Card key={pkg.name} className="flex flex-col p-5 sm:p-6" as="article">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className={`mb-3 h-1.5 w-16 rounded-full ${pkg.accent}`} />
                <h2 className="font-display text-2xl font-semibold tracking-tight text-text">
                  {pkg.name}
                </h2>
              </div>
              <Chip tone="accent">{pkg.badge}</Chip>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base">{pkg.purpose}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {pkg.facts.map((fact) => (
                <Chip key={fact}>{fact}</Chip>
              ))}
            </div>

            <div className="mt-5 grid gap-4">
              <CodeBlock code={pkg.install} lang="bash" title="Install" />
              <CodeBlock
                code={pkg.code}
                lang={pkg.name === 'graphein-mcp' ? 'json' : 'tsx'}
                title={pkg.codeTitle}
                maxHeight={380}
              />
            </div>

            {'link' in pkg && (
              <div className="mt-5">
                <ButtonLink to={pkg.link} variant="ghost" size="sm">
                  {pkg.linkLabel} →
                </ButtonLink>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Callout title="Why this split matters" tone="neutral">
        Browser apps can depend on <span className="font-mono text-text">graphein</span> without
        native or protocol dependencies. Server jobs opt into{' '}
        <span className="font-mono text-text">@graphein/node</span>; agents opt into{' '}
        <span className="font-mono text-text">graphein-mcp</span>.
      </Callout>

      <SectionHeader
        className="mt-8"
        eyebrow="Next"
        title="Choose by Runtime, Not Chart Type"
        lead="The same ChartSpec works across packages. Move from browser preview to React app to PNG export without rewriting the spec."
      />
    </Page>
  );
}
