import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { json } from '@codemirror/lang-json';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { Dashboard } from '@graphein/react';
import {
  repairSpec,
  summarize,
  validateSpec,
  type ChartSpec,
  type DashboardSpec,
  type RenderReport,
  type ValidationError,
} from 'graphein';
import { ChartCanvas } from '../components/chart/ChartCanvas';
import { ReportPanel } from '../components/chart/ReportPanel';
import { Page, PageHeader } from '../components/ui/Page';
import { Callout, Card, Chip, Kbd, Kicker } from '../components/ui/primitives';
import { presetGroups, presets, type Preset } from '../content/presets';
import { fullSpecJson } from '../lib/chart';
import { takePlaygroundHandoff } from '../lib/playground';
import { useTheme } from '../state/theme';

type AnySpec = ChartSpec | DashboardSpec;

interface ParsedState {
  spec: AnySpec | null;
  parseError: string | null;
  validation: ReturnType<typeof validateSpec> | null;
}

interface RepairState {
  applied: unknown[];
  remaining: ValidationError[];
}

const DEFAULT_PRESET = presets[0];
const URL_PARAM = 'spec';

function encodeShare(text: string): string | null {
  try {
    return btoa(unescape(encodeURIComponent(text)));
  } catch {
    return null;
  }
}

function decodeShare(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(escape(atob(value)));
  } catch {
    return null;
  }
}

function readUrlSpec(): string | null {
  const [, query = ''] = window.location.hash.split('?');
  return decodeShare(new URLSearchParams(query).get(URL_PARAM));
}

function updateUrlSpec(text: string) {
  const encoded = encodeShare(text);
  if (!encoded) return;
  const route = window.location.hash.split('?')[0] || '#/playground';
  const next = `${route}?${URL_PARAM}=${encodeURIComponent(encoded)}`;
  if (window.location.hash !== next) window.history.replaceState(null, '', next);
}

function pretty(spec: unknown): string {
  return JSON.stringify(spec, null, 2);
}

function cmTheme(mode: 'light' | 'dark'): Extension {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--text)',
        backgroundColor: 'var(--surface)',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.65',
      },
      '.cm-content': {
        padding: '18px 0',
        caretColor: 'var(--accent)',
      },
      '.cm-line': {
        padding: '0 18px',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--surface-2)',
        color: 'var(--faint)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLine': {
        backgroundColor: 'var(--accent-soft)',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'var(--accent-soft)',
        color: 'var(--accent)',
      },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'var(--accent-soft)',
      },
      '&.cm-focused': {
        outline: '2px solid var(--accent)',
        outlineOffset: '-2px',
      },
      '.cm-foldGutter span': {
        color: 'var(--faint)',
      },
    },
    { dark: mode === 'dark' },
  );
}

function initialText(): string {
  return readUrlSpec() ?? fullSpecJson(DEFAULT_PRESET.build());
}

function isDashboard(spec: AnySpec | null): spec is DashboardSpec {
  return spec?.type === 'dashboard';
}

function FindingList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'err' | 'warn';
  items: ValidationError[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Chip tone={tone}>{items.length}</Chip>
        <h3 className="font-display text-sm font-semibold text-text">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={`${item.path}-${item.message}-${i}`} className="rounded-xl border border-border bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={tone}>{tone === 'err' ? 'error' : item.severity ?? 'warning'}</Chip>
              {item.path && <Chip>{item.path}</Chip>}
              {item.rule && <Chip>{item.rule}</Chip>}
              {item.fix && <Chip tone="accent">auto-fix available</Chip>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.message}</p>
            {item.suggestion && (
              <p className="mt-2 font-mono text-xs text-faint">
                suggestion: {item.suggestion.kind} → {item.suggestion.candidates.join(', ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PresetPicker({
  selected,
  onPick,
}: {
  selected: string;
  onPick(preset: Preset): void;
}) {
  const groups = useMemo(() => presetGroups(), []);
  return (
    <select
      value={selected}
      onChange={(event) => {
        const preset = presets.find((p) => p.id === event.target.value);
        if (preset) onPick(preset);
      }}
      className="h-10 min-w-0 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text shadow-sm outline-none transition focus:border-accent"
      aria-label="Load a Graphein preset"
    >
      {groups.map((group) => (
        <optgroup key={group.group} label={group.group}>
          {group.items.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label} — {preset.note}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export function Playground() {
  const { theme } = useTheme();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeRef = useRef(new Compartment());
  const [source, setSource] = useState(initialText);
  const initialSourceRef = useRef(source);
  const [selectedPreset, setSelectedPreset] = useState(DEFAULT_PRESET.id);
  const [parsed, setParsed] = useState<ParsedState>({ spec: null, parseError: null, validation: null });
  const [repair, setRepair] = useState<RepairState | null>(null);
  const [report, setReport] = useState<RenderReport | null>(null);
  const [summary, setSummary] = useState('');
  const [stageWidth, setStageWidth] = useState(100);

  const writeText = useCallback((next: string) => {
    setSource(next);
    setRepair(null);
    setReport(null);
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== next) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    }
  }, []);

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        setRepair(null);
        setReport(null);
        setSource(update.state.doc.toString());
      }
    });
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialSourceRef.current,
        extensions: [basicSetup, json(), EditorView.lineWrapping, listener, themeRef.current.of(cmTheme(theme))],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeRef.current.reconfigure(cmTheme(theme)) });
  }, [theme]);

  useEffect(() => {
    const handoff = takePlaygroundHandoff();
    if (handoff) writeText(handoff);
  }, [writeText]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      const trimmed = source.trim();
      if (!trimmed) {
        setParsed({ spec: null, parseError: 'Paste or load a ChartSpec JSON object to begin.', validation: null });
        return;
      }
      try {
        const spec = JSON.parse(trimmed) as AnySpec;
        const validation = validateSpec(spec);
        setParsed({ spec, parseError: null, validation });
        if (validation.valid) {
          try {
            setSummary(isDashboard(spec) ? 'Interactive dashboard spec with shared data, selections, and placed views.' : summarize(spec));
          } catch {
            setSummary('');
          }
        } else {
          setSummary('');
        }
      } catch (error) {
        setParsed({
          spec: null,
          parseError: error instanceof Error ? error.message : 'The editor does not contain valid JSON.',
          validation: null,
        });
        setSummary('');
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [source]);

  useEffect(() => {
    const id = window.setTimeout(() => updateUrlSpec(source), 700);
    return () => window.clearTimeout(id);
  }, [source]);

  const loadPreset = useCallback(
    (preset: Preset) => {
      setSelectedPreset(preset.id);
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

  const validation = parsed.validation;
  const valid = Boolean(validation?.valid && parsed.spec);
  const canRepair = Boolean(parsed.spec && validation && (validation.errors.length > 0 || validation.warnings.some((w) => w.fix)));

  return (
    <Page wide>
      <PageHeader
        kicker="Playground"
        title="Live spec workbench"
        blurb="Write one JSON-serializable Graphein spec, validate it, repair safe mistakes, render it live, and read the chart’s own diagnostics without leaving the page."
      />

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-border bg-surface-2 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <Kicker>JSON editor</Kicker>
                <h2 className="mt-1 font-display text-xl font-semibold text-text">Author, validate, repair</h2>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <PresetPicker selected={selectedPreset} onPick={loadPreset} />
                <button
                  type="button"
                  onClick={repairCurrent}
                  disabled={!canRepair}
                  className="h-10 rounded-lg border border-border-strong bg-surface px-4 text-sm font-semibold text-text shadow-sm transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Repair
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-faint">
              <Chip tone={valid ? 'ok' : parsed.parseError ? 'err' : 'warn'}>
                {valid ? 'valid spec' : parsed.parseError ? 'invalid JSON' : 'needs attention'}
              </Chip>
              <span>
                <Kbd>Ctrl</Kbd> <Kbd>F</Kbd> search · soft-wrapped · shareable URL
              </span>
            </div>
          </div>

          <div className="h-[620px] border-b border-border bg-surface">
            <div ref={hostRef} className="h-full" />
          </div>

          <div className="space-y-4 p-4">
            {parsed.parseError && (
              <Callout tone="warn" title={<span className="text-err">JSON parse error</span>}>
                {parsed.parseError}
              </Callout>
            )}
            {validation && (
              <>
                {validation.valid && (
                  <Callout title="Ready to render">
                    Validation passed. The preview is rendering from the same object currently in the editor.
                  </Callout>
                )}
                <FindingList title="Errors" tone="err" items={validation.errors} />
                <FindingList title="Warnings" tone="warn" items={validation.warnings} />
              </>
            )}
            {repair && (
              <div className="rounded-xl border border-border bg-surface-2 p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Chip tone={repair.applied.length ? 'ok' : 'neutral'}>{repair.applied.length} patches applied</Chip>
                  <Chip tone={repair.remaining.length ? 'warn' : 'ok'}>{repair.remaining.length} remaining</Chip>
                </div>
                <pre className="max-h-44 overflow-auto rounded-lg border border-border bg-surface p-3 font-mono text-xs leading-relaxed text-muted">
                  {pretty({ applied: repair.applied, remaining: repair.remaining })}
                </pre>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Kicker>Live preview</Kicker>
                <h2 className="mt-1 font-display text-xl font-semibold text-text">Rendered output</h2>
              </div>
              <label className="flex min-w-52 items-center gap-3 text-sm text-muted">
                Width
                <input
                  type="range"
                  min={55}
                  max={100}
                  value={stageWidth}
                  onChange={(event) => setStageWidth(Number(event.target.value))}
                  className="accent-accent"
                />
                <span className="w-10 text-right font-mono text-xs text-faint">{stageWidth}%</span>
              </label>
            </div>
            <div className="gx-stage min-h-[520px] p-4 sm:p-6">
              {valid && parsed.spec ? (
                <div className="mx-auto h-[470px] overflow-hidden rounded-2xl border border-border bg-surface shadow-sm" style={{ width: `${stageWidth}%` }}>
                  {isDashboard(parsed.spec) ? (
                    <Dashboard spec={parsed.spec} className="h-full w-full" />
                  ) : (
                    <ChartCanvas
                      spec={parsed.spec}
                      onReport={(info) => {
                        setReport(info.report);
                        setSummary(info.summary);
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="flex min-h-[470px] items-center justify-center rounded-2xl border border-dashed border-border-strong bg-surface/70 p-8 text-center">
                  <div className="max-w-md">
                    <Chip tone="warn">waiting for a valid spec</Chip>
                    <p className="mt-4 text-sm leading-relaxed text-muted">
                      Fix JSON syntax or validation errors and Graphein will render the chart here automatically.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>

          <Card className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone={summary ? 'accent' : 'neutral'}>summarize()</Chip>
              <span className="text-sm text-faint">Deterministic plain-English chart readout</span>
            </div>
            <p className="text-sm leading-relaxed text-muted">{summary || 'A summary appears after the spec validates and renders.'}</p>
          </Card>

          <Card className="p-4">
            <ReportPanel report={report} />
          </Card>
        </div>
      </section>
    </Page>
  );
}
