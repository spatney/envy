import { useMemo, useState } from 'react';
import type { RenderReport } from 'graphein';
import { ChartStage } from './chart/ChartStage';
import { StoryControls } from './chart/StoryControls';
import { ReportPanel } from './chart/ReportPanel';
import { SpecViewer } from './chart/SpecViewer';
import { CodeBlock } from './ui/CodeBlock';
import { Tabs } from './ui/Tabs';
import { Chip, Kicker } from './ui/primitives';
import { fullSpecJson } from '../lib/chart';
import { defaultArgs, type Story, type StoryArgs } from '../stories/types';

const WIDTHS = [
  { id: 'full', label: 'Full', max: undefined as number | undefined },
  { id: 'wide', label: 'Wide', max: 880 },
  { id: 'narrow', label: 'Narrow', max: 560 },
] as const;

function reactSnippet(specJson: string, height: number): string {
  return `import { Chart } from '@graphein/react';

const spec = ${specJson};

export function Example() {
  return (
    <div style={{ height: ${height} }}>
      <Chart spec={spec} />
    </div>
  );
}`;
}

export function StoryPage({ story }: { story: Story }) {
  const [args, setArgs] = useState<StoryArgs>(() => defaultArgs(story));
  const [report, setReport] = useState<RenderReport | null>(null);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]['id']>(story.wide ? 'full' : 'wide');

  const spec = useMemo(() => story.spec(args), [story, args]);
  const height = story.height ?? (story.wide ? 460 : 420);
  const maxWidth = WIDTHS.find((w) => w.id === width)?.max;
  const hasControls = (story.controls?.length ?? 0) > 0;

  const tabs = [
    {
      id: 'spec',
      label: 'Spec',
      content: <SpecViewer spec={spec} />,
    },
    {
      id: 'react',
      label: 'React',
      content: (
        <CodeBlock
          code={story.reactCode ?? reactSnippet(fullSpecJson(spec), height)}
          lang="tsx"
          title="@graphein/react"
        />
      ),
    },
    {
      id: 'report',
      label: 'Report',
      content: <ReportPanel report={report} />,
    },
  ];
  if (story.docs) tabs.push({ id: 'docs', label: 'Docs', content: <div>{story.docs}</div> });

  return (
    <div className="mx-auto w-full max-w-6xl gx-rise">
      <header className="mb-5">
        <Kicker>{story.group}</Kicker>
        <h1 className="mt-1.5 font-display text-3xl font-semibold text-text">{story.title}</h1>
        {story.blurb && <p className="mt-2 max-w-2xl text-base text-muted">{story.blurb}</p>}
        {story.tags && story.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {story.tags.map((t) => (
              <Chip key={t}>{t}</Chip>
            ))}
          </div>
        )}
      </header>

      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {WIDTHS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWidth(w.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                width === w.id ? 'bg-surface text-text shadow-sm' : 'text-muted hover:text-text'
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className={hasControls ? 'grid gap-5 lg:grid-cols-[1fr_280px]' : ''}>
        <div className="min-w-0">
          <div className="mx-auto" style={{ maxWidth }}>
            <ChartStage spec={spec} height={height} onReport={(i) => setReport(i.report)} />
          </div>
        </div>
        {hasControls && (
          <aside className="gx-card h-fit p-4">
            <StoryControls
              controls={story.controls!}
              args={args}
              onChange={(id, v) => setArgs((a) => ({ ...a, [id]: v }))}
              onReset={() => setArgs(defaultArgs(story))}
            />
          </aside>
        )}
      </div>

      <section className="mt-6">
        <Tabs tabs={tabs} />
      </section>
    </div>
  );
}
