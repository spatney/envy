import { useCallback, useMemo, type CSSProperties } from 'react';
import { useChart } from '@graphein/react';
import { summarize, type ChartInstance, type ChartSpec, type RenderReport } from 'graphein';
import { useTheme } from '../../state/theme';
import { applyChartTheme } from '../../lib/chart';

export interface ChartReportInfo {
  report: RenderReport;
  summary: string;
  instance: ChartInstance;
}

export interface ChartCanvasProps {
  spec: ChartSpec;
  className?: string;
  style?: CSSProperties;
  /** Fired after every mount/update with the vision-free report + NL summary. */
  onReport?(info: ChartReportInfo): void;
}

/**
 * Mounts a single ChartSpec through the real `@graphein/react` runtime, applying
 * the live theme + sketch toggle, and surfaces the chart's own `report()` and
 * deterministic `summarize()` — the same self-critique an agent would read.
 */
export function ChartCanvas({ spec, className, style, onReport }: ChartCanvasProps) {
  const { theme, sketch } = useTheme();
  const themed = useMemo(() => applyChartTheme(spec, theme, sketch), [spec, theme, sketch]);

  const onReady = useCallback(
    (instance: ChartInstance) => {
      if (!onReport) return;
      try {
        const report = instance.report();
        let summary = report.summary ?? '';
        if (!summary) {
          try {
            summary = summarize(themed);
          } catch {
            summary = '';
          }
        }
        onReport({ report, summary, instance });
      } catch {
        /* report unavailable for this type */
      }
    },
    [onReport, themed],
  );

  const ref = useChart<HTMLDivElement>(themed, { onReady });
  return (
    <div
      ref={ref}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      aria-label="chart"
    />
  );
}
