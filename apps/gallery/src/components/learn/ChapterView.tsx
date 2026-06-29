import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { learnChapters, chapterIndex } from '../../learn/registry';
import { progress } from '../../learn/progress';
import type { Chapter } from '../../learn/types';
import { Chip, SpectrumBar } from '../ui/primitives';
import { TryIt } from './TryIt';

function useDone(id: string): boolean {
  return useSyncExternalStore(
    (cb) => progress.subscribe(cb),
    () => progress.isDone(id),
    () => false,
  );
}

export function ChapterView({ chapter }: { chapter: Chapter }) {
  const done = useDone(chapter.id);
  const idx = chapterIndex(chapter.id);
  const prev = idx > 0 ? learnChapters[idx - 1] : null;
  const next = idx < learnChapters.length - 1 ? learnChapters[idx + 1] : null;

  return (
    <article className="mx-auto max-w-5xl">
      <Link to="/learn" className="text-sm font-medium text-muted transition hover:text-accent">
        ← Learn track
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-faint">
            {String(idx + 1).padStart(2, '0')} · {chapter.group}
          </span>
          {done && <Chip tone="ok">completed</Chip>}
        </div>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">
          {chapter.title}
        </h1>
        <p className="mt-2 text-lg text-muted">{chapter.summary}</p>
        <SpectrumBar className="mt-5 w-24" />
      </header>

      <div className="mt-8 space-y-4">{chapter.concept}</div>

      <div className="mt-10">
        <TryIt chapter={chapter} />
      </div>

      <nav className="mt-12 flex items-center justify-between gap-4 border-t border-border pt-6">
        {prev ? (
          <Link
            to={`/learn/${prev.id}`}
            className="group flex flex-col rounded-xl border border-border bg-surface px-4 py-3 transition hover:border-accent"
          >
            <span className="text-xs text-faint">← Previous</span>
            <span className="font-display text-sm font-semibold text-text group-hover:text-accent">
              {prev.title}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            to={`/learn/${next.id}`}
            className="group flex flex-col items-end rounded-xl border border-border bg-surface px-4 py-3 text-right transition hover:border-accent"
          >
            <span className="text-xs text-faint">Next →</span>
            <span className="font-display text-sm font-semibold text-text group-hover:text-accent">
              {next.title}
            </span>
          </Link>
        ) : (
          <Link
            to="/learn"
            className="group flex flex-col items-end rounded-xl border border-border bg-surface px-4 py-3 text-right transition hover:border-accent"
          >
            <span className="text-xs text-faint">Done →</span>
            <span className="font-display text-sm font-semibold text-text group-hover:text-accent">
              Back to the track
            </span>
          </Link>
        )}
      </nav>
    </article>
  );
}
