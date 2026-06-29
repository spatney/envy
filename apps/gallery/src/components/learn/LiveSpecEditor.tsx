import { useEffect, useMemo, useState } from 'react';
import { Dashboard } from '@graphein/react';
import { validateSpec, type ChartSpec, type DashboardSpec, type ValidationError } from 'graphein';
import { ChartCanvas } from '../chart/ChartCanvas';
import { CodeMirrorEditor } from '../editor/CodeMirrorEditor';
import { Chip } from '../ui/primitives';

type AnySpec = ChartSpec | DashboardSpec;

export interface ParseState {
  spec: AnySpec | null;
  parseError: string | null;
  validation: ReturnType<typeof validateSpec> | null;
}

function isDashboard(spec: AnySpec | null): spec is DashboardSpec {
  return spec?.type === 'dashboard';
}

function parse(source: string): ParseState {
  const trimmed = source.trim();
  if (!trimmed) return { spec: null, parseError: 'Write a spec to begin.', validation: null };
  try {
    const spec = JSON.parse(trimmed) as AnySpec;
    return { spec, parseError: null, validation: validateSpec(spec) };
  } catch (error) {
    return {
      spec: null,
      parseError: error instanceof Error ? error.message : 'Invalid JSON.',
      validation: null,
    };
  }
}

function ErrorRow({ item }: { item: ValidationError }) {
  return (
    <li className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="err">error</Chip>
        {item.path && <Chip>{item.path}</Chip>}
      </div>
      <p className="mt-1.5 leading-relaxed text-muted">{item.message}</p>
    </li>
  );
}

export interface LiveSpecEditorProps {
  value: string;
  onChange(next: string): void;
  /** Editor height in px (preview matches). */
  height?: number;
  /** Notified on every parse so a parent can run a challenge check. */
  onParse?(state: ParseState): void;
  ariaLabel?: string;
}

/**
 * A two-pane "edit a spec, see it render" surface: a CodeMirror JSON editor on the
 * left and a live, theme-aware chart (or validation errors) on the right. Used by the
 * Learn track and the guides' inline exercises.
 */
export function LiveSpecEditor({ value, onChange, height = 360, onParse, ariaLabel }: LiveSpecEditorProps) {
  const [state, setState] = useState<ParseState>(() => parse(value));

  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = parse(value);
      setState(next);
      onParse?.(next);
    }, 200);
    return () => window.clearTimeout(id);
  }, [value]);

  const valid = Boolean(state.validation?.valid && state.spec);
  const errors = state.validation?.errors ?? [];
  const previewSpec = useMemo(() => state.spec, [state.spec]);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2">
          <span className="font-mono text-[11px] uppercase tracking-wide text-faint">spec.json</span>
          <Chip tone={valid ? 'ok' : state.parseError ? 'err' : 'warn'}>
            {valid ? 'valid' : state.parseError ? 'invalid JSON' : `${errors.length} error${errors.length === 1 ? '' : 's'}`}
          </Chip>
        </div>
        <div className="overflow-auto" style={{ height }}>
          <CodeMirrorEditor value={value} onChange={onChange} ariaLabel={ariaLabel ?? 'Editable chart spec'} />
        </div>
      </div>

      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-2">
          <span className="font-mono text-[11px] uppercase tracking-wide text-faint">render()</span>
        </div>
        <div className="gx-stage flex-1 p-4" style={{ minHeight: height }}>
          {valid && previewSpec ? (
            isDashboard(previewSpec) ? (
              <Dashboard spec={previewSpec} className="h-full w-full" />
            ) : (
              <ChartCanvas spec={previewSpec as ChartSpec} />
            )
          ) : (
            <div className="flex h-full items-center justify-center">
              {state.parseError ? (
                <p className="max-w-xs text-center text-sm text-muted">
                  <span className="mb-1 block font-mono text-xs text-err">JSON error</span>
                  {state.parseError}
                </p>
              ) : (
                <ul className="w-full space-y-2">
                  {errors.slice(0, 4).map((item, i) => (
                    <ErrorRow key={`${item.path}-${i}`} item={item} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
