import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../components/ui/Page';
import { Button, ButtonLink, Chip, SectionHeader, SpectrumBar } from '../components/ui/primitives';
import { chapterGroups, learnChapters } from '../learn/registry';
import { progress } from '../learn/progress';

function useDoneSet(): Set<string> {
  return useSyncExternalStore(
    (cb) => progress.subscribe(cb),
    () => progress.all(),
    () => new Set<string>(),
  );
}

export function Learn() {
  const done = useDoneSet();
  const total = learnChapters.length;
  const complete = learnChapters.filter((c) => done.has(c.id)).length;
  const pct = Math.round((complete / total) * 100);
  const nextChapter = learnChapters.find((c) => !done.has(c.id)) ?? learnChapters[0];
  const started = complete > 0;

  return (
    <Page wide>
      <header className="gx-rise overflow-hidden rounded-3xl border border-border bg-surface">
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <div className="aurora" aria-hidden="true" />
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-accent">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--grad-brand)' }} />
              Learn
            </div>
            <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-text sm:text-5xl">
              Learn Graphein by <span className="spectrum-text">Editing Real Specs</span>
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted">
              Fourteen short chapters. Each chapter teaches one ChartSpec field, gives you one edit, and checks the result against the rendered chart. No setup.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ButtonLink to={`/learn/${nextChapter.id}`} size="lg">
                {started ? 'Continue' : 'Start Chapter 01'}
              </ButtonLink>
              {started && (
                <Button variant="ghost" onClick={() => progress.clearAll()}>
                  Reset progress
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="border-t border-border bg-surface-2 px-6 py-4 sm:px-10">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text">
              {complete} of {total} complete
            </span>
            <span className="font-mono text-xs text-faint">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: 'var(--grad-brand)' }} />
          </div>
        </div>
      </header>

      <div className="mt-12 space-y-12">
        {chapterGroups().map((group) => (
          <section key={group.title}>
            <SectionHeader eyebrow={`${group.chapters.length} chapters`} title={group.title} />
            <SpectrumBar className="mt-3 w-16" />
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.chapters.map((chapter) => {
                const isDone = done.has(chapter.id);
                const number = String(learnChapters.indexOf(chapter) + 1).padStart(2, '0');
                return (
                  <Link
                    key={chapter.id}
                    to={`/learn/${chapter.id}`}
                    className="spectrum-border group relative flex flex-col rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-faint">{number}</span>
                      {isDone ? <Chip tone="ok">done</Chip> : <span className="text-faint">→</span>}
                    </div>
                    <h3 className="mt-3 font-display text-lg font-semibold text-text group-hover:text-accent">
                      {chapter.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{chapter.summary}</p>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}
