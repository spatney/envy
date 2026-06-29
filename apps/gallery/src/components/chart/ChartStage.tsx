import { useState, type ReactNode } from 'react';
import type { ChartSpec } from 'graphein';
import { ChartCanvas, type ChartReportInfo } from './ChartCanvas';

export interface ChartStageProps {
  spec: ChartSpec;
  height?: number;
  /** Toolbar slot rendered top-right of the stage. */
  toolbar?: ReactNode;
  /** Show the deterministic NL summary under the chart. */
  showSummary?: boolean;
  onReport?(info: ChartReportInfo): void;
  /** A subtle dotted backdrop behind the chart. */
  padded?: boolean;
}

/**
 * A framed, sized container that mounts a chart and (optionally) shows its
 * self-generated plain-English summary underneath — the storybook "canvas".
 */
export function ChartStage({
  spec,
  height = 420,
  toolbar,
  showSummary = true,
  onReport,
  padded = true,
}: ChartStageProps) {
  const [info, setInfo] = useState<ChartReportInfo | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      {toolbar && (
        <div className="flex items-center justify-end gap-2 border-b border-border bg-surface-2 px-3 py-2">
          {toolbar}
        </div>
      )}
      <div
        className={padded ? 'gx-stage p-4 sm:p-5' : ''}
        style={{ height }}
      >
        <ChartCanvas
          spec={spec}
          onReport={(i) => {
            setInfo(i);
            onReport?.(i);
          }}
        />
      </div>
      {showSummary && info?.summary && (
        <div className="border-t border-border bg-surface-2 px-4 py-2.5">
          <p className="text-sm text-muted">
            <span className="mr-2 font-mono text-[11px] uppercase tracking-wide text-accent">
              summarize()
            </span>
            {info.summary}
          </p>
        </div>
      )}
    </div>
  );
}
