import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ChartSpec } from 'graphein';
import { mcpCall, backendAvailable, fetchMcpResource, type McpResource, type McpTool } from '../lib/api';
import { Page, PageHeader } from '../components/ui/Page';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Tabs } from '../components/ui/Tabs';
import { Callout, Card, Chip, Kicker, Spinner } from '../components/ui/primitives';

type ToolResult = Awaited<ReturnType<typeof mcpCall>>;
type ResourceName = 'agent-guide' | 'schema' | 'spec-reference';

const brokenSpec = {
  type: 'baar',
  title: 'Northwind platform revenue, Q1 2026',
  data: [
    { month: '2026-01', revenue: 184000, region: 'North America' },
    { month: '2026-02', revenue: 213000, region: 'North America' },
    { month: '2026-03', revenue: 239000, region: 'North America' },
  ],
  encoding: {
    x: { field: 'month', type: 'temporal' },
    y: { field: 'revenue' },
  },
} as unknown as ChartSpec;

const workingSpec = {
  type: 'line',
  title: 'Agent-assisted revenue recovery',
  data: [
    { week: '2026-04-01', revenue: 41000 },
    { week: '2026-04-08', revenue: 46500 },
    { week: '2026-04-15', revenue: 52200 },
    { week: '2026-04-22', revenue: 59800 },
  ],
  encoding: {
    x: { field: 'week', type: 'temporal' },
    y: { field: 'revenue' },
  },
  trendline: true,
} as ChartSpec;

const toolSpecs: Record<McpTool, ChartSpec> = {
  validate: brokenSpec,
  repair: brokenSpec,
  render: workingSpec,
  summarize: workingSpec,
};

const resourceMeta: Record<ResourceName, { label: string; lang: 'json' | 'bash'; note: string }> = {
  'agent-guide': {
    label: 'Agent guide',
    lang: 'bash',
    note: 'The narrative playbook an agent reads before generating a chart.',
  },
  schema: {
    label: 'JSON schema',
    lang: 'json',
    note: 'The machine contract for every serializable ChartSpec field.',
  },
  'spec-reference': {
    label: 'Spec reference',
    lang: 'bash',
    note: 'The complete field-by-field reference exposed as an MCP resource.',
  },
};

const wiringSnippets = [
  {
    id: 'claude',
    label: 'Claude Desktop',
    location: 'Settings → Developer → Edit Config; on Windows this is typically Claude\\claude_desktop_config.json under AppData.',
    code: {
      mcpServers: {
        graphein: {
          command: 'npx',
          args: ['-y', 'graphein-mcp'],
        },
      },
    },
  },
  {
    id: 'cursor',
    label: 'Cursor',
    location: 'Project .cursor\\mcp.json or the global MCP settings file.',
    code: {
      mcpServers: {
        graphein: {
          command: 'npx',
          args: ['-y', 'graphein-mcp'],
        },
      },
    },
  },
  {
    id: 'vscode',
    label: 'VS Code / Copilot MCP',
    location: 'Workspace .vscode\\mcp.json or the user-level MCP configuration.',
    code: {
      mcpServers: {
        graphein: {
          command: 'npx',
          args: ['-y', 'graphein-mcp'],
        },
      },
    },
  },
];

function textContent(result?: ToolResult | null) {
  return result?.content
    .filter((item) => item.type === 'text' && item.text)
    .map((item) => item.text)
    .join('\n\n') ?? '';
}

function imageContent(result?: ToolResult | null) {
  return result?.content.find((item) => item.type === 'image' && item.data && item.mimeType);
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function Stage({
  number,
  title,
  tone = 'neutral',
  children,
}: {
  number: string;
  title: string;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn';
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Chip tone={tone}>{number}</Chip>
        <h3 className="font-display text-lg font-semibold text-text">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function ToolRunner({ tool }: { tool: McpTool }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const body =
        tool === 'render'
          ? { spec: toolSpecs[tool], width: 640, height: 360, dpr: 1 }
          : { spec: toolSpecs[tool] };
      setResult(await mcpCall(tool, body));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [tool]);

  const text = textContent(result);
  const image = imageContent(result);

  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-3">
        <p className="text-sm leading-relaxed text-muted">
          This runner sends the exact spec below to <span className="font-mono text-text">mcpCall('{tool}')</span>.
        </p>
        <CodeBlock code={pretty(toolSpecs[tool])} lang="json" title={`${tool} input`} maxHeight={300} />
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface-2 px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-3 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {running && <Spinner />}
          Run {tool}
        </button>
      </div>
      <div className="space-y-3">
        {error && <Callout tone="warn" title="Tool call failed">{error}</Callout>}
        {!result && !error && (
          <div className="rounded-xl border border-border bg-surface-2 p-5 text-sm text-muted">
            Run the tool to see the live MCP response.
          </div>
        )}
        {image?.data && image.mimeType && (
          <img
            alt="MCP render result"
            className="w-full rounded-xl border border-border bg-surface"
            src={`data:${image.mimeType};base64,${image.data}`}
          />
        )}
        {text && (
          <CodeBlock
            code={text}
            lang={text.trim().startsWith('{') || text.trim().startsWith('[') ? 'json' : 'bash'}
            title={`${tool} result`}
            maxHeight={360}
          />
        )}
      </div>
    </div>
  );
}

export function Mcp() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loadingLoop, setLoadingLoop] = useState(true);
  const [loopError, setLoopError] = useState<string | null>(null);
  const [validateText, setValidateText] = useState('');
  const [repairText, setRepairText] = useState('');
  const [repairedSpec, setRepairedSpec] = useState<ChartSpec | null>(null);
  const [renderText, setRenderText] = useState('');
  const [renderImage, setRenderImage] = useState<{ src: string; mimeType: string } | null>(null);
  const [summaryText, setSummaryText] = useState('');
  const [resources, setResources] = useState<Partial<Record<ResourceName, McpResource>>>({});
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceName>('agent-guide');

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoadingLoop(true);
      setLoopError(null);
      try {
        const ok = await backendAvailable();
        if (!alive) return;
        setAvailable(ok);
        if (!ok) {
          setLoadingLoop(false);
          return;
        }

        const validate = await mcpCall('validate', { spec: brokenSpec });
        const repair = await mcpCall('repair', { spec: brokenSpec });
        const repaired = parseJson<{ spec?: ChartSpec }>(textContent(repair))?.spec ?? workingSpec;
        const render = await mcpCall('render', { spec: repaired, width: 720, height: 420, dpr: 1 });
        const summarize = await mcpCall('summarize', { spec: repaired });
        const image = imageContent(render);

        if (!alive) return;
        setValidateText(textContent(validate));
        setRepairText(textContent(repair));
        setRepairedSpec(repaired);
        setRenderText(textContent(render));
        setSummaryText(textContent(summarize));
        setRenderImage(
          image?.data && image.mimeType
            ? { src: `data:${image.mimeType};base64,${image.data}`, mimeType: image.mimeType }
            : null,
        );
      } catch (err) {
        if (alive) setLoopError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoadingLoop(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadResources() {
      if (!available) return;
      setResourceError(null);
      try {
        const entries = await Promise.all(
          (Object.keys(resourceMeta) as ResourceName[]).map(async (name) => [name, await fetchMcpResource(name)] as const),
        );
        if (alive) setResources(Object.fromEntries(entries) as Partial<Record<ResourceName, McpResource>>);
      } catch (err) {
        if (alive) setResourceError(err instanceof Error ? err.message : String(err));
      }
    }
    void loadResources();
    return () => {
      alive = false;
    };
  }, [available]);

  const repairJson = useMemo(() => parseJson<{ applied?: unknown[]; spec?: ChartSpec }>(repairText), [repairText]);
  const selected = resources[selectedResource];

  return (
    <Page wide>
      <PageHeader
        kicker="MCP server"
        title="A live console for the Graphein agent loop"
        blurb="graphein-mcp turns chart building into a toolable loop: validate a JSON spec, repair safe mistakes, render a PNG, and return a deterministic critique — while serving the same guide, schema, and reference an agent needs to use the API correctly."
      />

      <div className="grid gap-5">
        <Card className="gx-rise overflow-hidden p-6">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div>
              <Kicker>Why it matters</Kicker>
              <h2 className="mt-2 font-display text-2xl font-semibold text-text">
                Agents need feedback, not screenshots.
              </h2>
              <p className="mt-3 leading-relaxed text-muted">
                A human can glance at a chart and notice a typo, a clipped axis, or a weak explanation. An
                agent needs those checks exposed as data. Graphein MCP packages the entire
                validate → repair → render → critique cycle as callable tools, then serves the API knowledge as
                resources so the agent can correct itself without guessing.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {['validate', 'repair', 'render', 'summarize'].map((tool) => (
                <div key={tool} className="rounded-xl border border-border bg-surface-2 p-4">
                  <div className="font-mono text-xs uppercase tracking-wide text-faint">tool</div>
                  <div className="mt-1 font-display text-lg font-semibold text-text">{tool}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {available === false && (
          <Callout tone="warn" title="Live backend unavailable">
            Run <span className="font-mono text-text">npm run gallery</span> locally to enable the MCP endpoints.
            The wiring examples and resource map below still show how clients connect to the published server.
          </Callout>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <Kicker>Centerpiece</Kicker>
              <h2 className="mt-1 font-display text-2xl font-semibold text-text">Broken → repaired → rendered → explained</h2>
            </div>
            <Chip tone={repairJson?.applied?.length ? 'ok' : 'neutral'}>
              {repairJson?.applied?.length ? 'real repair applied' : 'waiting for repair'}
            </Chip>
          </div>

          {loadingLoop && (
            <Card className="flex items-center gap-3 p-5 text-muted">
              <Spinner /> Calling the live MCP tools…
            </Card>
          )}
          {loopError && <Callout tone="warn" title="Loop failed">{loopError}</Callout>}

          {!loadingLoop && available !== false && !loopError && (
            <div className="grid gap-4">
              <Stage number="01" title="validate finds the typo" tone="warn">
                <p className="mb-3 text-sm leading-relaxed text-muted">
                  The story starts with a deliberately broken spec: <span className="font-mono text-text">type: "baar"</span>.
                  Validation returns structured JSON with a safe patch that changes it to <span className="font-mono text-text">bar</span>.
                </p>
                <CodeBlock code={validateText} lang="json" title="mcpCall('validate', { spec })" maxHeight={340} />
                <div data-testid="loop-validate" className="sr-only">{validateText}</div>
              </Stage>

              <Stage number="02" title="repair applies the JSON Patch" tone="ok">
                <div className="grid gap-3 lg:grid-cols-2">
                  <CodeBlock code={pretty(repairJson?.applied ?? [])} lang="json" title="applied patches" maxHeight={260} />
                  <CodeBlock
                    code={pretty(repairJson?.spec ?? repairedSpec ?? {})}
                    lang="json"
                    title="repaired spec"
                    maxHeight={260}
                  />
                </div>
                <div data-testid="loop-repair" className="sr-only">{repairText}</div>
              </Stage>

              <Stage number="03" title="render returns a real PNG" tone="accent">
                <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-2xl border border-border bg-surface-2 p-3">
                    {renderImage ? (
                      <img
                        data-testid="loop-image"
                        alt="Rendered bar chart repaired by graphein-mcp"
                        className="w-full rounded-xl border border-border bg-surface"
                        src={renderImage.src}
                      />
                    ) : (
                      <div className="flex min-h-72 items-center justify-center text-muted">No image content returned.</div>
                    )}
                  </div>
                  <CodeBlock code={renderText} lang="json" title="render report" maxHeight={360} />
                </div>
              </Stage>

              <Stage number="04" title="summarize explains the result" tone="neutral">
                <p className="mb-3 text-sm leading-relaxed text-muted">
                  The same render call also returns the chart report: a vision-free critique with mark counts,
                  diagnostics, contrast checks, and summary text. The summarize tool exposes the concise natural-language
                  version for alt text, test assertions, or agent self-review.
                </p>
                <div className="rounded-xl border border-border bg-surface-2 p-4 text-lg leading-relaxed text-text">
                  {summaryText}
                </div>
              </Stage>
            </div>
          )}
        </section>

        <Card className="p-5">
          <div className="mb-4">
            <Kicker>Tool tabs</Kicker>
            <h2 className="mt-1 font-display text-2xl font-semibold text-text">Run each MCP tool directly</h2>
          </div>
          {available === false ? (
            <Callout tone="neutral">Start the gallery backend to enable these live runners.</Callout>
          ) : (
            <Tabs
              tabs={(Object.keys(toolSpecs) as McpTool[]).map((tool) => ({
                id: tool,
                label: tool,
                content: <ToolRunner tool={tool} />,
              }))}
            />
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <Kicker>Served resources</Kicker>
              <h2 className="mt-1 font-display text-2xl font-semibold text-text">The exact docs an agent receives</h2>
              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
                graphein-mcp does not only execute tools. It serves the chart schema, the agent guide, and the full spec
                reference as resources, so a client can retrieve authoritative API knowledge at the moment it needs it.
              </p>
            </div>
            <select
              value={selectedResource}
              onChange={(event) => setSelectedResource(event.target.value as ResourceName)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm font-medium text-text"
            >
              {(Object.keys(resourceMeta) as ResourceName[]).map((name) => (
                <option key={name} value={name}>
                  {resourceMeta[name].label}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-3 text-sm text-muted">{resourceMeta[selectedResource].note}</p>
          {resourceError && <Callout tone="warn" title="Resource fetch failed">{resourceError}</Callout>}
          {available === false ? (
            <Callout tone="neutral">
              When the backend is running, this panel fetches <span className="font-mono text-text">agent-guide</span>,{' '}
              <span className="font-mono text-text">schema</span>, and{' '}
              <span className="font-mono text-text">spec-reference</span> from the MCP resource endpoint.
            </Callout>
          ) : selected?.text ? (
            <div data-testid="resource-code">
              <CodeBlock
                code={selected.text}
                lang={resourceMeta[selectedResource].lang}
                title={selected.title ?? selectedResource}
                maxHeight={420}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 p-5 text-muted">
              <Spinner /> Loading resource text…
            </div>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4">
            <Kicker>How to wire it up</Kicker>
            <h2 className="mt-1 font-display text-2xl font-semibold text-text">One server entry, many clients</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              The published package can be launched with <span className="font-mono text-text">npx -y graphein-mcp</span>.
              If the binary is already installed, use <span className="font-mono text-text">graphein-mcp</span> as the command instead.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {wiringSnippets.map((snippet) => (
              <div key={snippet.id} className="space-y-3 rounded-2xl border border-border bg-surface-2 p-4">
                <div>
                  <h3 className="font-display text-lg font-semibold text-text">{snippet.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{snippet.location}</p>
                </div>
                <CodeBlock code={pretty(snippet.code)} lang="json" title="mcpServers" maxHeight={260} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Page>
  );
}
