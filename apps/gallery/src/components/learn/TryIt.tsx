import { useCallback, useEffect, useMemo, useState } from 'react';
import { validateSpec, type ChartSpec, type DashboardSpec } from 'graphein';
import { fullSpecJson } from '../../lib/chart';
import { progress } from '../../learn/progress';
import type { Chapter } from '../../learn/types';
import { Button } from '../ui/primitives';
import { LiveSpecEditor, type ParseState } from './LiveSpecEditor';

type AnySpec = ChartSpec | DashboardSpec;

type Status =
  | { kind: 'idle' }
  | { kind: 'pass' }
  | { kind: 'fail'; hints: string[] }
  | { kind: 'blocked'; hints: string[] };

export function TryIt({ chapter }: { chapter: Chapter }) {
  const starter = useMemo(() => fullSpecJson(chapter.starter), [chapter]);
  const [source, setSource] = useState(starter);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [parseState, setParseState] = useState<ParseState | null>(null);

  // Reset editor + status whenever the chapter changes.
  useEffect(() => {
    setSource(starter);
    setStatus({ kind: 'idle' });
  }, [starter]);

  const handleChange = useCallback((next: string) => {
    setSource(next);
    setStatus({ kind: 'idle' });
  }, []);

  const runCheck = useCallback(() => {
    let spec: AnySpec;
    try {
      spec = JSON.parse(source) as AnySpec;
    } catch {
      setStatus({ kind: 'blocked', hints: ['The editor does not contain valid JSON yet — fix the syntax first.'] });
      return;
    }
    const validation = validateSpec(spec);
    if (!validation.valid) {
      setStatus({
        kind: 'blocked',
        hints: ['Validation reports errors — resolve them before checking.', ...validation.errors.slice(0, 3).map((e) => e.message)],
      });
      return;
    }
    const result = chapter.check(spec);
    if (result.pass) {
      progress.complete(chapter.id);
      setStatus({ kind: 'pass' });
    } else {
      setStatus({ kind: 'fail', hints: result.hints });
    }
  }, [chapter, source]);

  const reveal = useCallback(() => {
    setSource(fullSpecJson(chapter.solution));
    setStatus({ kind: 'idle' });
  }, [chapter]);

  const reset = useCallback(() => {
    setSource(starter);
    setStatus({ kind: 'idle' });
  }, [starter]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-spec-2/30 bg-[color-mix(in_oklab,var(--spec-2)_7%,transparent)] p-4">
        <div className="flex items-center gap-2">
          <span className="spectrum-fill rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
            Your turn
          </span>
        </div>
        <div className="mt-2 text-sm leading-relaxed text-text">{chapter.goal}</div>
      </div>

      <LiveSpecEditor
        value={source}
        onChange={handleChange}
        height={chapter.height ?? 340}
        onParse={setParseState}
        ariaLabel={`Editable spec for ${chapter.title}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="spectrum" onClick={runCheck} disabled={!parseState}>
          Check my answer
        </Button>
        <Button variant="outline" onClick={reveal}>
          Reveal solution
        </Button>
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
      </div>

      {status.kind === 'pass' && (
        <div className="rounded-xl border border-ok/40 bg-[color-mix(in_oklab,var(--ok)_12%,transparent)] px-4 py-3 text-sm">
          <strong className="font-semibold text-ok">Nice — that passes.</strong>{' '}
          <span className="text-muted">You can keep experimenting, reveal the reference answer, or move on.</span>
        </div>
      )}
      {(status.kind === 'fail' || status.kind === 'blocked') && (
        <div className="rounded-xl border border-warn/40 bg-[color-mix(in_oklab,var(--warn)_12%,transparent)] px-4 py-3 text-sm">
          <strong className="font-semibold text-warn">
            {status.kind === 'blocked' ? 'Almost — fix this first' : 'Not quite yet'}
          </strong>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
            {status.hints.map((hint, i) => (
              <li key={i}>{hint}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
