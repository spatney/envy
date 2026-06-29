import { useState } from 'react';
import type { ChartSpec, DashboardSpec } from 'graphein';
import { fullSpecJson } from '../../lib/chart';
import { LiveSpecEditor } from '../learn/LiveSpecEditor';

export function InlineTryIt({
  spec,
  height = 360,
  title = 'Try it',
}: {
  spec: ChartSpec | DashboardSpec;
  height?: number;
  title?: string;
}) {
  const [value, setValue] = useState(() => fullSpecJson(spec));

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
        <div>
          <div className="font-display text-sm font-semibold text-text">{title}</div>
          <p className="mt-0.5 text-xs text-faint">Edit the JSON and Graphein validates + renders it inline.</p>
        </div>
      </div>
      <div className="p-3">
        <LiveSpecEditor value={value} onChange={setValue} height={height} ariaLabel={`${title} spec editor`} />
      </div>
    </section>
  );
}
