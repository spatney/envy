import { Link } from 'react-router-dom';
import type { RefObject } from 'react';
import { useTheme } from '../../state/theme';
import { BrandMark } from './BrandMark';
import { Kbd } from '../ui/primitives';

const REPO_URL = 'https://github.com/spatney/graphein';

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick(): void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`grid h-9 w-9 place-items-center rounded-lg border text-base transition-colors ${
        active
          ? 'border-accent/40 bg-accent-soft text-accent'
          : 'border-border bg-surface text-muted hover:text-text'
      }`}
    >
      {children}
    </button>
  );
}

export function TopBar({
  onOpenMenu,
  onOpenSearch,
  searchButtonRef,
}: {
  onOpenMenu(): void;
  onOpenSearch(): void;
  searchButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { theme, sketch, toggleTheme, toggleSketch } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur">
      <button
        type="button"
        onClick={onOpenMenu}
        className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted lg:hidden"
        aria-label="Open navigation menu"
      >
        ☰
      </button>

      <Link to="/" className="flex items-center gap-2 text-text" aria-label="Graphein home">
        <span className="text-accent">
          <BrandMark size={26} />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">Graphein</span>
      </Link>

      <span className="ml-1 hidden rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-faint sm:inline">
        agent-first dataviz
      </span>

      <div className="flex-1" />

      <button
        ref={searchButtonRef}
        type="button"
        onClick={onOpenSearch}
        className="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-faint transition-colors hover:text-muted sm:flex"
        aria-label="Open command palette"
      >
        <span>Search…</span>
        <Kbd>⌘K</Kbd>
      </button>

      <IconButton label="Toggle sketch mode" onClick={toggleSketch} active={sketch}>
        ✎
      </IconButton>
      <IconButton label="Toggle theme" onClick={toggleTheme}>
        {theme === 'dark' ? '☀' : '☾'}
      </IconButton>

      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="hidden h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-muted transition-colors hover:text-text sm:flex"
        aria-label="Open Graphein repository on GitHub"
      >
        GitHub ↗
      </a>
    </header>
  );
}
