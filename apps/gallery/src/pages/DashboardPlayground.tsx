import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  repairSpec,
  validateSpec,
  type DashboardInstance,
  type DashboardSpec,
  type SelectionValue,
  type ValidationError,
} from 'graphein';
import { DashboardCanvas } from '../components/chart/DashboardCanvas';
import { CodeMirrorEditor } from '../components/editor/CodeMirrorEditor';
import { Button, ButtonLink, Callout, Card, Chip, Kicker } from '../components/ui/primitives';
import { dashboardPresets } from '../content/presets';
import { fullSpecJson } from '../lib/chart';

interface ParsedState {
  spec: DashboardSpec | null;
  parseError: string | null;
  validation: ReturnType<typeof validateSpec> | null;
  /** Set when the JSON is a valid spec but not a dashboard. */
  wrongType: boolean;
}

interface RepairState {
  applied: unknown[];
  remaining: ValidationError[];
}

const DEFAULT_PRESET = dashboardPresets[0];

function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/** Reduce the selection map to only the params that currently hold a value. */
function activeSelection(
  all: SelectionValue | null | Record<string, SelectionValue | null>,
): Record<string, SelectionValue> {
  const out: Record<string, SelectionValue> = {};
  if (all && typeof all === 'object' && !('kind' in all)) {
    for (const [name, value] of Object.entries(all as Record<string, SelectionValue | null>)) {
      if (value) out[name] = value;
    }
  }
  return out;
}

/** A calm status pill summarizing the editor's validation state. */
function StatusPill({ state }: { state: ParsedState }) {
  const valid = Boolean(state.validation?.valid && state.spec);
  const errors = state.validation?.errors.length ?? 0;
  const [tone, label] = state.parseError
    ? (['err', 'Invalid JSON'] as const)
    : state.wrongType
      ? (['warn', 'Not a dashboard'] as const)
      : valid
        ? (['ok', 'Valid dashboard'] as const)
        : (['warn', `${errors} error${errors === 1 ? '' : 's'}`] as const);
  const cls =
    tone === 'ok'
      ? 'border-ok/25 bg-ok/10 text-ok'
      : tone === 'err'
        ? 'border-err/25 bg-err/10 text-err'
        : 'border-warn/25 bg-warn/10 text-warn';
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold ${cls}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

/** A single labelled meta figure (small, calm — not a giant display number). */
function Meta({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <div className="font-display text-lg font-semibold tracking-tight text-text">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-faint">{label}</div>
    </div>
  );
}

function FindingList({ tone, items }: { tone: 'err' | 'warn'; items: ValidationError[] }) {
  if (items.length === 0) return null;
  const dot = tone === 'err' ? 'bg-err' : 'bg-warn';
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={`${item.path}-${item.message}-${i}`} className="flex gap-2.5 text-sm leading-relaxed">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
          <span className="min-w-0 text-muted">
            {item.path && <span className="font-mono text-xs text-faint">{item.path} · </span>}
            {item.message}
            {item.fix && <span className="ml-1.5 text-xs font-medium text-accent">· auto-fixable</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPlayground() {
  const [source, setSource] = useState(() => fullSpecJson(DEFAULT_PRESET.build()));
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PRESET.id);
  const [parsed, setParsed] = useState<ParsedState>({
    spec: null,
    parseError: null,
    validation: null,
    wrongType: false,
  });
  const [repair, setRepair] = useState<RepairState | null>(null);
  const [selection, setSelection] = useState<Record<string, SelectionValue>>({});

  const instanceRef = useRef<DashboardInstance | null>(null);

  const writeText = useCallback((next: string) => {
    setSource(next);
    setRepair(null);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const trimmed = source.trim();
      if (!trimmed) {
        setParsed({ spec: null, parseError: 'Paste or load a DashboardSpec to begin.', validation: null, wrongType: false });
        return;
      }
      try {
        const spec = JSON.parse(trimmed) as DashboardSpec;
        const validation = validateSpec(spec);
        const wrongType = spec.type !== 'dashboard';
        setParsed({ spec: wrongType ? null : spec, parseError: null, validation, wrongType });
      } catch (error) {
        setParsed({
          spec: null,
          parseError: error instanceof Error ? error.message : 'The editor does not contain valid JSON.',
          validation: null,
          wrongType: false,
        });
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [source]);

  const loadPreset = useCallback(
    (id: string) => {
      const preset = dashboardPresets.find((p) => p.id === id);
      if (!preset) return;
      setSelectedPreset(preset.id);
      setSelection({});
      writeText(fullSpecJson(preset.build()));
    },
    [writeText],
  );

  const repairCurrent = useCallback(() => {
    if (!parsed.spec) return;
    const result = repairSpec(parsed.spec);
    writeText(pretty(result.spec));
    setRepair({ applied: result.applied, remaining: result.remaining });
  }, [parsed.spec, writeText]);

  const refreshSelection = useCallback(() => {
    const inst = instanceRef.current;
    if (inst) setSelection(activeSelection(inst.getSelection()));
  }, []);

  const validation = parsed.validation;
  const valid = Boolean(validation?.valid && parsed.spec);
  const canRepair = Boolean(
    parsed.spec && validation && (validation.errors.length > 0 || validation.warnings.some((w) => w.fix)),
  );
  const selectedNote = dashboardPresets.find((p) => p.id === selectedPreset)?.note;
  const viewCount = parsed.spec?.views?.length ?? 0;
  const sectionCount = parsed.spec?.layout?.sections?.length ?? 0;
  const wiring = !parsed.spec
    ? '—'
    : parsed.spec.interactions === 'none'
      ? 'none'
      : Array.isArray(parsed.spec.interactions)
        ? 'manual'
        : 'auto';
  const activeParams = Object.keys(selection);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8">
      <header className="mb-9 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Kicker>Dashboard Playground</Kicker>
          <h1 className="mt-2.5 font-display text-3xl font-semibold tracking-tight text-text sm:text-[2.5rem] sm:leading-[1.1]">
            Compose a BI page
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            One <span className="font-mono text-sm text-text">DashboardSpec</span> wires slicers, KPIs, and charts to a
            shared dataset and selection bus. Edit it live, validate, repair, and watch cross-filters flow.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <StatusPill state={parsed} />
          <ButtonLink to="/playground" variant="outline" size="sm">
            Single visual →
          </ButtonLink>
        </div>
      </header>

      <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Editor */}
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Load a dashboard preset</span>
              <select
                value={selectedPreset}
                onChange={(event) => loadPreset(event.target.value)}
                className="h-10 w-full min-w-0 appearance-none rounded-lg border border-border bg-surface-2 pl-3.5 pr-9 text-sm font-medium text-text outline-none transition focus:border-accent"
              >
                {dashboardPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true">
                ▾
              </span>
            </label>
            <Button type="button" onClick={repairCurrent} disabled={!canRepair} variant="outline" size="sm" className="h-10 shrink-0 rounded-lg">
              Repair
            </Button>
          </div>
          {selectedNote && <p className="px-4 pt-3 text-xs leading-relaxed text-faint">{selectedNote}</p>}

          <div className="mt-3 h-[460px] border-y border-border bg-surface">
            <CodeMirrorEditor
              value={source}
              onChange={writeText}
              className="h-full"
              ariaLabel="Graphein dashboard spec JSON"
            />
          </div>

          {parsed.parseError && (
            <div className="p-4">
              <Callout tone="warn" title={<span className="text-err">JSON parse error</span>}>{parsed.parseError}</Callout>
            </div>
          )}
        </Card>

        {/* Inspector */}
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="font-display text-base font-semibold text-text">Validation</h2>
            {parsed.wrongType ? (
              <Callout tone="warn" title="That's a single visual">
                This page renders <span className="font-mono text-xs">type:&nbsp;&quot;dashboard&quot;</span> specs.{' '}
                <ButtonLink to="/playground" variant="ghost" size="sm" className="px-1">
                  Chart Playground →
                </ButtonLink>
              </Callout>
            ) : valid ? (
              <p className="flex items-center gap-2 text-sm text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" />
                Schema valid — the preview renders from the object in the editor.
              </p>
            ) : validation ? (
              <div className="space-y-3">
                <FindingList tone="err" items={validation.errors} />
                <FindingList tone="warn" items={validation.warnings} />
              </div>
            ) : (
              <p className="text-sm text-muted">Waiting for valid JSON…</p>
            )}
            {repair && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                <Chip tone={repair.applied.length ? 'ok' : 'neutral'}>{repair.applied.length} patches applied</Chip>
                <Chip tone={repair.remaining.length ? 'warn' : 'ok'}>{repair.remaining.length} remaining</Chip>
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-text">Selection bus</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={activeParams.length === 0}
                onClick={() => {
                  instanceRef.current?.clearSelection();
                  refreshSelection();
                }}
              >
                Clear
              </Button>
            </div>
            {activeParams.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted">
                No active filters. Use a slicer or click a mark — every source cross-filters the page and publishes its
                selection here as plain JSON.
              </p>
            ) : (
              <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed text-muted">
                {pretty(selection)}
              </pre>
            )}
            <div className="grid grid-cols-4 gap-3 border-t border-border pt-4">
              <Meta value={viewCount} label="Views" />
              <Meta value={sectionCount} label="Sections" />
              <Meta value={wiring} label="Wiring" />
              <Meta value={activeParams.length} label="Filters" />
            </div>
          </Card>
        </div>
      </section>

      {/* Full-width live preview */}
      <section className="mt-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Kicker>Live preview</Kicker>
            <h2 className="mt-1.5 font-display text-xl font-semibold text-text">Rendered page</h2>
          </div>
          <span className="text-xs text-faint">Full width · slicers and mark clicks cross-filter the page</span>
        </div>
        {valid && parsed.spec ? (
          <div className="rounded-[20px] border border-border bg-surface-2/40 p-4 sm:p-6">
            <DashboardCanvas
              spec={parsed.spec}
              className="mx-auto"
              onReady={(inst) => {
                instanceRef.current = inst;
                setSelection(activeSelection(inst.getSelection()));
              }}
              onSelectionChange={refreshSelection}
            />
          </div>
        ) : (
          <div className="flex min-h-[360px] items-center justify-center rounded-[20px] border border-dashed border-border-strong bg-surface-2/30 p-6 text-center">
            <div className="max-w-sm">
              <p className="font-display text-base font-semibold text-text">No preview yet</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {parsed.parseError
                  ? 'Fix the JSON syntax to render the page.'
                  : parsed.wrongType
                    ? 'Load a dashboard preset, or open a single visual in the chart Playground.'
                    : 'Resolve the validation errors and the full cross-interacting page renders here.'}
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
