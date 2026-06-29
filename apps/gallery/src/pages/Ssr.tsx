import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChartSpec, RenderReport } from 'graphein';
import { ChartCanvas } from '../components/chart/ChartCanvas';
import { ReportPanel } from '../components/chart/ReportPanel';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Page, PageHeader } from '../components/ui/Page';
import {
  Button,
  Callout,
  Card,
  Chip,
  GradientText,
  Kicker,
  SectionHeader,
  SpectrumBar,
  Spinner,
  Stat,
} from '../components/ui/primitives';
import { backendAvailable, ssrRender } from '../lib/api';
import { applyChartTheme } from '../lib/chart';
import { scenarioById } from '../content/scenarios';
import { useTheme, type ThemeName } from '../state/theme';

const EXAMPLES = [
  {
    id: 'line-multi',
    label: 'Regional revenue trend',
    copy: 'A multi-series line chart with temporal scales, legend, and theme-aware strokes.',
  },
  {
    id: 'bar-stacked',
    label: 'Stacked quarterly revenue',
    copy: 'Composition inside each quarter, rendered from tidy rows rather than a pre-pivot.',
  },
  {
    id: 'scatter-groups',
    label: 'Spend vs. return bubbles',
    copy: 'A grouped scatterplot with color and size channels in the exported PNG.',
  },
  {
    id: 'heatmap-week',
    label: 'Traffic density heatmap',
    copy: 'A categorical grid with labels, legend, and colored cells rendered headlessly.',
  },
] as const;

const SIZE_PRESETS = [
  { label: 'Compact', width: 720, height: 420 },
  { label: 'Presentation', width: 900, height: 480 },
  { label: 'Wide', width: 1120, height: 520 },
] as const;

const NODE_SNIPPET = `import { renderChart } from '@graphein/node';
import { writeFileSync } from 'node:fs';

const { png, report } = renderChart(spec, {
  width: 900,
  height: 480,
  dpr: 2,
});

if (!report.ok) {
  console.warn(report.diagnostics);
}

writeFileSync('chart.png', png);`;

interface SsrState {
  loading: boolean;
  available: boolean | null;
  pngBase64: string | null;
  report: RenderReport | null;
  ms: number | null;
  error: string | null;
}

function getExampleSpec(id: string): ChartSpec {
  const scenario = scenarioById(id);
  if (!scenario) return scenarioById('line-multi')!.spec();
  return scenario.spec();
}

function base64ToBlob(base64: string, type = 'image/png') {
  const bytes = atob(base64);
  const chunks: BlobPart[] = [];
  for (let i = 0; i < bytes.length; i += 1024) {
    const slice = bytes.slice(i, i + 1024);
    const chunk = new Uint8Array(slice.length);
    for (let j = 0; j < slice.length; j += 1) chunk[j] = slice.charCodeAt(j);
    chunks.push(chunk as BlobPart);
  }
  return new Blob(chunks, { type });
}

function Field({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(value: number): void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</span>
      <input
        className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text outline-none transition focus:border-accent"
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}

export function Ssr() {
  const { theme, sketch, setTheme, setSketch } = useTheme();
  const [selectedId, setSelectedId] = useState<(typeof EXAMPLES)[number]['id']>('line-multi');
  const [width, setWidth] = useState(900);
  const [height, setHeight] = useState(480);
  const [dpr, setDpr] = useState(2);
  const [state, setState] = useState<SsrState>({
    loading: true,
    available: null,
    pngBase64: null,
    report: null,
    ms: null,
    error: null,
  });

  const selected = EXAMPLES.find((example) => example.id === selectedId) ?? EXAMPLES[0];
  const spec = useMemo(() => getExampleSpec(selectedId), [selectedId]);
  const themedSpec = useMemo(() => applyChartTheme(spec, theme, sketch), [sketch, spec, theme]);
  const imageSrc = state.pngBase64 ? `data:image/png;base64,${state.pngBase64}` : null;
  const outputPixels = `${Math.round(width * dpr)}×${Math.round(height * dpr)}`;

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));

    async function renderServerPng() {
      const available = await backendAvailable();
      if (!alive) return;
      if (!available) {
        setState({
          loading: false,
          available: false,
          pngBase64: null,
          report: null,
          ms: null,
          error: null,
        });
        return;
      }

      try {
        const result = await ssrRender(themedSpec, { width, height, dpr });
        if (!alive) return;
        if (!result.ok || !result.pngBase64 || !result.report) {
          setState({
            loading: false,
            available: true,
            pngBase64: null,
            report: null,
            ms: null,
            error: result.error ?? 'The server returned an empty render response.',
          });
          return;
        }
        setState({
          loading: false,
          available: true,
          pngBase64: result.pngBase64,
          report: result.report as RenderReport,
          ms: result.ms ?? null,
          error: null,
        });
      } catch (error) {
        if (!alive) return;
        setState({
          loading: false,
          available: true,
          pngBase64: null,
          report: null,
          ms: null,
          error: error instanceof Error ? error.message : 'Server-side rendering failed.',
        });
      }
    }

    void renderServerPng();
    return () => {
      alive = false;
    };
  }, [dpr, height, themedSpec, width]);

  const downloadPng = useCallback(() => {
    if (!state.pngBase64) return;
    const url = URL.createObjectURL(base64ToBlob(state.pngBase64));
    const link = document.createElement('a');
    link.href = url;
    link.download = `graphein-${selectedId}-${width}x${height}@${dpr}x.png`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [dpr, height, selectedId, state.pngBase64, width]);

  return (
    <Page wide>
      <PageHeader
        kicker="Server-side rendering"
        title="Headless PNGs With @graphein/node"
        blurb="Send the same agent-authored ChartSpec to browsers, docs, CI, notebooks, and reports. @graphein/node renders through @napi-rs/canvas, returns PNG bytes plus RenderReport, and keeps the core engine zero-dependency."
      />

      <Card className="relative mb-5 overflow-hidden p-5">
        <div className="aurora" aria-hidden="true" />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_460px] lg:items-end">
          <SectionHeader
            eyebrow="PNG pipeline"
            title={
              <>
                Browser Spec. <GradientText>Server PNG.</GradientText>
              </>
            }
            lead="This page posts a themed ChartSpec to /api/ssr, receives a real PNG from @graphein/node, and shows the latency plus the RenderReport returned by the same call."
          />
          <div className="grid grid-cols-3 gap-3 rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur">
            <Stat value={state.ms === null ? '—' : `${state.ms}ms`} label="backend latency" gradient={state.ms !== null} />
            <Stat value={outputPixels} label="PNG pixels" />
            <Stat value={state.report?.markCount ?? '—'} label="marks checked" />
          </div>
        </div>
        <SpectrumBar className="relative mt-5" />
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-surface-2 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Kicker>Live backend</Kicker>
                <h2 className="mt-1 font-display text-2xl font-semibold text-text">
                  Render on the server
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                  Pick a real gallery spec, send width, height, and device pixel ratio to the
                  running Vite backend, then inspect the PNG and the machine-readable critique it
                  generated.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {state.loading && <Spinner />}
                {state.ms !== null && <Chip tone="ok">{state.ms} ms</Chip>}
                <Chip tone={state.available === false ? 'warn' : 'accent'}>
                  {state.available === false ? 'static mode' : 'dpr ' + dpr}
                </Chip>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-5 xl:grid-cols-[260px_1fr]">
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-faint">
                  Example spec
                </span>
                <div className="space-y-2">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example.id}
                      className={`w-full rounded-xl border px-3 py-3 text-left transition ${
                        selectedId === example.id
                          ? 'border-accent bg-accent-soft'
                          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2'
                      }`}
                      type="button"
                      onClick={() => setSelectedId(example.id)}
                    >
                      <span className="block font-display text-sm font-semibold text-text">
                        {example.label}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed text-muted">
                        {example.copy}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-xs font-semibold text-muted transition hover:border-accent hover:text-text"
                    type="button"
                    onClick={() => {
                      setWidth(preset.width);
                      setHeight(preset.height);
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Width" value={width} min={480} max={1400} onChange={setWidth} />
                <Field label="Height" value={height} min={280} max={900} onChange={setHeight} />
                <Field label="DPR" value={dpr} min={1} max={3} step={0.5} onChange={setDpr} />
              </div>

              <div className="rounded-2xl border border-border bg-surface-2 p-3">
                <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Theme controls</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['light', 'dark'] as ThemeName[]).map((name) => (
                    <Button
                      key={name}
                      type="button"
                      variant={theme === name ? 'spectrum' : 'outline'}
                      size="sm"
                      className="rounded-lg"
                      onClick={() => setTheme(name)}
                    >
                      {name}
                    </Button>
                  ))}
                </div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-muted">
                  Sketch rendering
                  <input
                    type="checkbox"
                    checked={sketch}
                    onChange={(event) => setSketch(event.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                </label>
              </div>
            </div>

            <div className="space-y-4">
              {state.available === false && (
                <Callout tone="warn" title="Live renderer unavailable in this build">
                  Static deployments do not expose the Node SSR endpoint. Run{' '}
                  <span className="font-mono text-text">npm run gallery</span> locally to stream a
                  real @graphein/node PNG and RenderReport from the dev backend.
                </Callout>
              )}

              {state.error && (
                <Callout tone="warn" title="The server render did not complete">
                  {state.error}
                </Callout>
              )}

              <div className="gx-stage min-h-[360px] overflow-hidden rounded-2xl border border-border bg-surface p-4">
                {state.loading ? (
                  <div className="flex h-[360px] flex-col items-center justify-center gap-3 text-muted">
                    <Spinner className="h-6 w-6" />
                    <span className="text-sm">Rendering a retina PNG on the server…</span>
                  </div>
                ) : imageSrc ? (
                  <img
                    className="mx-auto block max-h-[560px] w-full rounded-xl border border-border bg-surface object-contain"
                    src={imageSrc}
                    alt={`Server-rendered Graphein PNG for ${selected.label}`}
                  />
                ) : (
                  <div className="flex h-[360px] items-center justify-center rounded-xl border border-border bg-surface-2 px-6 text-center text-sm text-muted">
                    Choose a spec or run the gallery backend to generate a live PNG.
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-lg border-accent text-accent"
                  disabled={!state.pngBase64}
                  onClick={downloadPng}
                >
                  Download PNG
                </Button>
                <span className="text-xs text-faint">
                  Output: {width}×{height} CSS pixels · {dpr}× pixel density · {theme} theme
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <Kicker>RenderReport</Kicker>
              <h2 className="mt-1 font-display text-2xl font-semibold text-text">
                Server-Side RenderReport
              </h2>
            </div>
            {state.report?.ok && <Chip tone="ok">clean</Chip>}
          </div>
          <ReportPanel report={state.report} />
        </Card>
      </div>

      <Card className="mt-5 p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Kicker>Parity view</Kicker>
            <h2 className="mt-1 font-display text-2xl font-semibold text-text">
              One ChartSpec, Two Runtimes
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">
              The browser canvas below uses the React wrapper; the PNG beside it came from Node.
              Graphein keeps the spec contract identical so agents can preview interactively and
              export deterministically.
            </p>
          </div>
          <Chip tone="accent">{selected.label}</Chip>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="border-b border-border bg-surface-2 px-4 py-2">
              <span className="font-display text-sm font-semibold text-text">In browser</span>
            </div>
            <div className="gx-stage h-[420px] p-4">
              <ChartCanvas spec={themedSpec} className="rounded-xl border border-border bg-surface" />
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2">
              <span className="font-display text-sm font-semibold text-text">Server PNG</span>
              {state.ms !== null && <span className="font-mono text-xs text-faint">{state.ms} ms</span>}
            </div>
            <div className="gx-stage flex h-[420px] items-center justify-center p-4">
              {state.loading ? (
                <Spinner className="h-6 w-6" />
              ) : imageSrc ? (
                <img
                  className="max-h-full w-full rounded-xl border border-border bg-surface object-contain"
                  src={imageSrc}
                  alt="The same Graphein spec rendered by @graphein/node"
                />
              ) : (
                <span className="text-sm text-muted">Server image unavailable.</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5">
          <Kicker>Why it matters</Kicker>
          <h2 className="mt-1 font-display text-2xl font-semibold text-text">
            PNG Exports Without a Browser Farm
          </h2>
          <div className="mt-4 grid gap-3 text-sm leading-relaxed text-muted">
            <p>
              @graphein/node is a leaf package: it brings native canvas rendering for servers,
              workers, and CI while the main <span className="font-mono text-text">graphein</span>{' '}
              engine remains dependency-free and tree-shakeable.
            </p>
            <p>
              The response includes PNG bytes plus the same RenderReport agents use in the gallery: mark counts, clipping checks, contrast checks, and ok/needs-attention status.
            </p>
          </div>
        </Card>

        <CodeBlock code={NODE_SNIPPET} lang="ts" title="@graphein/node" />
      </div>
    </Page>
  );
}
