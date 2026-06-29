import { useMemo, useState } from 'react';
import type { RenderReport } from 'graphein';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ChartStage } from '../components/chart/ChartStage';
import { ReportPanel } from '../components/chart/ReportPanel';
import { SpecViewer } from '../components/chart/SpecViewer';
import { StoryControls } from '../components/chart/StoryControls';
import { CodeBlock } from '../components/ui/CodeBlock';
import { Page } from '../components/ui/Page';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import {
  Button,
  ButtonLink,
  Card,
  Chip,
  GradientText,
  Kbd,
  Kicker,
  SpectrumBar,
  Stat,
} from '../components/ui/primitives';
import { fullSpecJson } from '../lib/chart';
import { stashForPlayground } from '../lib/playground';
import { allStories, storyById } from '../stories/registry';
import { defaultArgs, type Story, type StoryArgs } from '../stories/types';

const WIDTHS = [
  { id: 'full', label: 'Full', max: undefined as number | undefined },
  { id: 'wide', label: 'Wide', max: 920 },
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

function storyPath(story: Story): string {
  return `/charts/${story.id}`;
}

function dataCount(spec: { data?: unknown }): number | string {
  return Array.isArray(spec.data) ? spec.data.length : '—';
}

function PlaygroundButton({ spec, children }: { spec: ReturnType<Story['spec']>; children: string }) {
  const navigate = useNavigate();
  return (
    <Button
      type="button"
      onClick={() => {
        stashForPlayground(spec);
        navigate('/playground');
      }}
    >
      {children}
    </Button>
  );
}

function StoryDetail({ story }: { story: Story }) {
  const [args, setArgs] = useState<StoryArgs>(() => defaultArgs(story));
  const [report, setReport] = useState<RenderReport | null>(null);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]['id']>(story.wide ? 'full' : 'wide');

  const spec = useMemo(() => story.spec(args), [story, args]);
  const height = story.height ?? (story.wide ? 460 : 420);
  const maxWidth = WIDTHS.find((w) => w.id === width)?.max;
  const hasControls = (story.controls?.length ?? 0) > 0;

  const groupStories = useMemo(() => allStories.filter((s) => s.group === story.group), [story.group]);
  const storyIndex = groupStories.findIndex((s) => s.id === story.id);
  const prevStory =
    groupStories.length > 1 ? groupStories[(storyIndex - 1 + groupStories.length) % groupStories.length] : undefined;
  const nextStory = groupStories.length > 1 ? groupStories[(storyIndex + 1) % groupStories.length] : undefined;

  const tabs: TabItem[] = [
    {
      id: 'spec',
      label: 'Spec',
      content: <SpecViewer spec={spec} maxHeight={560} />,
    },
    {
      id: 'react',
      label: 'React',
      content: (
        <CodeBlock
          code={story.reactCode ?? reactSnippet(fullSpecJson(spec), height)}
          lang="tsx"
          title="@graphein/react"
          maxHeight={560}
        />
      ),
    },
    {
      id: 'report',
      label: 'Report',
      content: <ReportPanel report={report} />,
    },
  ];
  if (story.docs) {
    tabs.push({
      id: 'docs',
      label: 'Docs',
      content: <Card className="p-5 text-sm leading-relaxed text-muted">{story.docs}</Card>,
    });
  }

  return (
    <Page wide>
      <div className="aurora pointer-events-none fixed inset-x-0 top-0 h-72 opacity-40" aria-hidden="true" />
      <div className="relative gx-rise">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <ButtonLink to="/charts" variant="ghost" size="sm">
            ← Back to catalog
          </ButtonLink>
          <div className="flex flex-wrap items-center gap-2">
            {prevStory && (
              <ButtonLink to={storyPath(prevStory)} variant="outline" size="sm">
                ← {prevStory.title}
              </ButtonLink>
            )}
            {nextStory && (
              <ButtonLink to={storyPath(nextStory)} variant="outline" size="sm">
                {nextStory.title} →
              </ButtonLink>
            )}
          </div>
        </div>

        <header className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-md)]">
          <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
            <div className="p-6 sm:p-8">
              <Kicker>{story.group}</Kicker>
              <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">
                <GradientText>{story.title}</GradientText>
              </h1>
              {story.blurb && <p className="mt-4 max-w-3xl text-lg leading-relaxed text-muted">{story.blurb}</p>}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Chip tone="accent">{spec.type}</Chip>
                {story.tags?.map((tag) => (
                  <Chip key={tag}>{tag}</Chip>
                ))}
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <PlaygroundButton spec={spec}>Edit in Playground</PlaygroundButton>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('spec-panel')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  View spec
                </Button>
              </div>
            </div>

            <div className="border-t border-border bg-surface-2 p-6 sm:p-8 lg:border-l lg:border-t-0">
              <div className="grid grid-cols-3 gap-5">
                <Stat value={String(spec.type)} label="Type" gradient />
                <Stat value={dataCount(spec)} label="Rows" />
                <Stat value={story.controls?.length ?? 0} label="Controls" />
              </div>
              <SpectrumBar className="my-6" />
              <p className="text-sm leading-relaxed text-muted">
                Use controls to change the generated <Kbd>ChartSpec</Kbd>. The Report tab updates from
                <span className="font-mono text-accent"> chart.report()</span>.
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2 p-3">
              <div>
                <Kicker className="text-[11px]">Live render</Kicker>
                <p className="mt-1 text-sm text-muted">Resize the stage without changing the ChartSpec.</p>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-surface p-1">
                {WIDTHS.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    onClick={() => setWidth(w.id)}
                    aria-pressed={width === w.id}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      width === w.id ? 'spectrum-fill shadow-[var(--shadow-glow)]' : 'text-muted hover:text-text'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mx-auto" style={{ maxWidth }}>
              <ChartStage spec={spec} height={height} onReport={(i) => setReport(i.report)} />
            </div>
          </div>

          <aside className="space-y-4">
            <Card className="p-5">
              {hasControls ? (
                <StoryControls
                  controls={story.controls!}
                  args={args}
                  onChange={(controlId, value) => setArgs((current) => ({ ...current, [controlId]: value }))}
                  onReset={() => setArgs(defaultArgs(story))}
                />
              ) : (
                <div>
                  <Kicker>No controls</Kicker>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    This story renders directly from its static spec.
                  </p>
                </div>
              )}
            </Card>
            <Card className="p-5">
              <Kicker>Playground handoff</Kicker>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Send the current args and ChartSpec to the Playground for validation, repair, and iteration.
              </p>
              <div className="mt-4">
                <PlaygroundButton spec={spec}>Open current spec</PlaygroundButton>
              </div>
            </Card>
          </aside>
        </section>

        <section id="spec-panel" className="mt-8">
          <Tabs tabs={tabs} stripClassName="w-full overflow-x-auto rounded-2xl bg-surface-2" />
        </section>

        <nav
          aria-label={`${story.group} stories`}
          className="mt-8 grid gap-3 border-t border-border pt-6 sm:grid-cols-2"
        >
          {prevStory && (
            <Link
              to={storyPath(prevStory)}
              className="spectrum-border rounded-2xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-faint">Previous in group</div>
              <div className="mt-1 font-display text-lg font-semibold text-text">← {prevStory.title}</div>
            </Link>
          )}
          {nextStory && (
            <Link
              to={storyPath(nextStory)}
              className="spectrum-border rounded-2xl border border-border bg-surface p-4 text-right transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-faint">Next in group</div>
              <div className="mt-1 font-display text-lg font-semibold text-text">{nextStory.title} →</div>
            </Link>
          )}
        </nav>
      </div>
    </Page>
  );
}

export function StoryRoute() {
  const { id } = useParams<{ id: string }>();
  const story = id ? storyById(id) : undefined;
  if (!story) return <Navigate to="/" replace />;
  return <StoryDetail key={story.id} story={story} />;
}
