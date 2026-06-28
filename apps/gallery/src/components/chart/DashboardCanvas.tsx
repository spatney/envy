import { useMemo, type CSSProperties } from 'react';
import { useDashboard } from '@graphein/react';
import type { DashboardInstance, DashboardSpec } from 'graphein';
import { useTheme } from '../../state/theme';
import { applyChartTheme } from '../../lib/chart';

export interface DashboardCanvasProps {
  spec: DashboardSpec;
  className?: string;
  style?: CSSProperties;
  onReady?(instance: DashboardInstance): void;
}

/** Mounts a full cross-interacting DashboardSpec via the real runtime. */
export function DashboardCanvas({ spec, className, style, onReady }: DashboardCanvasProps) {
  const { theme, sketch } = useTheme();
  const themed = useMemo(() => applyChartTheme(spec, theme, sketch), [spec, theme, sketch]);
  const ref = useDashboard<HTMLDivElement>(themed, { onReady });
  return <div ref={ref} className={className} style={{ width: '100%', ...style }} />;
}
