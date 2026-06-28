import { useNavigate } from 'react-router-dom';
import type { ChartSpec, DashboardSpec } from 'graphein';
import { summarizeSpecJson } from '../../lib/chart';
import { stashForPlayground } from '../../lib/playground';
import { CodeBlock } from '../ui/CodeBlock';

export interface SpecViewerProps {
  spec: ChartSpec | DashboardSpec;
  /** Show the "Open in Playground" action. */
  playground?: boolean;
  maxHeight?: number;
}

/** Compact JSON view of a spec with copy + "Open in Playground". */
export function SpecViewer({ spec, playground = true, maxHeight = 460 }: SpecViewerProps) {
  const navigate = useNavigate();
  const json = summarizeSpecJson(spec);

  return (
    <div className="space-y-2">
      {playground && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              stashForPlayground(spec);
              navigate('/playground');
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent transition-colors hover:border-accent/60"
          >
            Open in Playground →
          </button>
        </div>
      )}
      <CodeBlock code={json} lang="json" title="ChartSpec" maxHeight={maxHeight} />
    </div>
  );
}
