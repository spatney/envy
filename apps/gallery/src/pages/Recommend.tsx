import { useMemo, useState } from 'react';
import { recommendChart, type RecommendOptions } from 'graphein';
import { ChartCanvas } from '../components/chart/ChartCanvas';
import { CodeMirrorEditor } from '../components/editor/CodeMirrorEditor';
import { Page } from '../components/ui/Page';
import { Button, Callout, Card, Chip, Kicker, Stat } from '../components/ui/primitives';

const SAMPLE_ROWS = [
  { month: '2024-01', region: 'West', sales: 420 },
  { month: '2024-02', region: 'West', sales: 465 },
  { month: '2024-03', region: 'West', sales: 501 },
  { month: '2024-01', region: 'East', sales: 310 },
  { month: '2024-02', region: 'East', sales: 348 },
  { month: '2024-03', region: 'East', sales: 390 },
];

const INTENTS: Array<NonNullable<RecommendOptions['intent']> | ''> = [
  '',
  'trend',
  'comparison',
  'distribution',
  'relationship',
  'composition',
];

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseRows(source: string): { rows: Record<string, unknown>[] | null; error: string | null } {
  try {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed) || parsed.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
      return { rows: null, error: 'Paste a JSON array of row objects.' };
    }
    return { rows: parsed as Record<string, unknown>[], error: null };
  } catch (error) {
    return { rows: null, error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}

export function RecommendPanel() {
  const [source, setSource] = useState(() => pretty(SAMPLE_ROWS));
  const [intent, setIntent] = useState<(typeof INTENTS)[number]>('');
  const [selected, setSelected] = useState(0);

  const parsed = useMemo(() => parseRows(source), [source]);
  const recommendations = useMemo(
    () => (parsed.rows ? recommendChart(parsed.rows, { intent: intent || undefined, maxResults: 5 }) : []),
    [intent, parsed.rows],
  );
  const active = recommendations[selected] ?? recommendations[0];

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <Kicker>Recommend</Kicker>
          <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">
            Rows in, chart candidates out
          </h1>
          <p className="mt-2 text-muted">
            Paste tidy JSON rows, optionally choose an intent, and Graphein ranks ready-to-render specs.
          </p>
        </div>
        <div className="flex gap-3">
          <Stat value={parsed.rows?.length ?? '—'} label="rows" />
          <Stat value={recommendations.length} label="candidates" gradient={recommendations.length > 0} />
        </div>
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-2 p-3">
            <Chip tone={parsed.error ? 'err' : 'ok'}>{parsed.error ? 'invalid rows' : 'rows parsed'}</Chip>
            <select
              value={intent}
              onChange={(event) => {
                setIntent(event.target.value as (typeof INTENTS)[number]);
                setSelected(0);
              }}
              className="h-10 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text shadow-sm outline-none transition focus:border-accent"
              aria-label="Recommendation intent"
            >
              {INTENTS.map((value) => (
                <option key={value || 'auto'} value={value}>
                  {value || 'auto intent'}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" className="h-10 rounded-lg" onClick={() => setSource(pretty(SAMPLE_ROWS))}>
              Reset sample
            </Button>
          </div>
          <div className="h-[520px] border-b border-border bg-surface">
            <CodeMirrorEditor value={source} onChange={setSource} className="h-full" ariaLabel="Tidy data rows JSON" />
          </div>
          <div className="space-y-3 p-4">
            {parsed.error ? (
              <Callout tone="warn" title={<span className="text-err">JSON parse error</span>}>
                {parsed.error}
              </Callout>
            ) : (
              <Callout>
                Recommendations use the same dependency-free <span className="font-mono text-accent">recommendChart()</span> API available to agents.
              </Callout>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-border bg-surface-2 p-4">
              <Kicker>Ranked recommendations</Kicker>
              <div className="mt-3 flex flex-wrap gap-2">
                {recommendations.map((rec, index) => (
                  <button
                    key={`${rec.spec.type}-${index}`}
                    type="button"
                    onClick={() => setSelected(index)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      rec === active ? 'border-transparent spectrum-fill' : 'border-border bg-surface text-muted hover:text-text'
                    }`}
                  >
                    #{index + 1} {rec.spec.type} · {Math.round(rec.score * 100)}
                  </button>
                ))}
              </div>
            </div>
            {active ? (
              <div className="space-y-4 p-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-text">{String(active.spec.title)}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{active.rationale}</p>
                </div>
                <div className="gx-stage h-[360px] overflow-hidden rounded-2xl border border-border bg-surface p-4">
                  <ChartCanvas spec={active.spec} />
                </div>
              </div>
            ) : (
              <div className="p-4">
                <Callout tone="neutral">Paste rows with at least one recognizable column to see candidates.</Callout>
              </div>
            )}
          </Card>

          {active && (
            <Card className="overflow-hidden">
              <div className="border-b border-border bg-surface-2 p-4">
                <Kicker>Spec preview</Kicker>
              </div>
              <pre className="max-h-[420px] overflow-auto p-4 font-mono text-xs leading-relaxed text-muted">
                {pretty(active.spec)}
              </pre>
            </Card>
          )}
        </div>
      </section>
    </>
  );
}

export function Recommend() {
  return (
    <Page wide>
      <RecommendPanel />
    </Page>
  );
}
