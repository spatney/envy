import type { RenderReport } from 'graphein';
import { Chip } from '../ui/primitives';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="font-display text-lg font-semibold tabular-nums text-text">{value}</span>
      <span className="text-[11px] uppercase tracking-wide text-faint">{label}</span>
    </div>
  );
}

const SEV_TONE = { error: 'err', warning: 'warn', info: 'neutral' } as const;

/** Renders a chart's vision-free RenderReport — the agent self-critique. */
export function ReportPanel({ report }: { report: RenderReport | null }) {
  if (!report) {
    return <p className="text-sm text-faint">No render report for this visual.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Chip tone={report.ok ? 'ok' : 'warn'}>
          {report.ok ? '✓ looks clean' : '⚠ needs attention'}
        </Chip>
        <span className="font-mono text-xs text-faint">report()</span>
      </div>
      <div className="grid grid-cols-4 gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
        <Stat label="marks" value={report.markCount} />
        <Stat label="series" value={report.seriesCount} />
        <Stat label="colors" value={report.colorCount} />
        <Stat label="type" value={report.type} />
      </div>
      {report.diagnostics.length > 0 && (
        <ul className="space-y-1.5">
          {report.diagnostics.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Chip tone={SEV_TONE[d.severity]}>{d.severity}</Chip>
              <span className="text-muted">
                <span className="font-mono text-xs text-faint">{d.code}</span> — {d.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
