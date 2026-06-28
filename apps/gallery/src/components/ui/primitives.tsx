import type { ReactNode } from 'react';

/** A rounded surface card with hairline border. */
export function Card({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}) {
  return <Tag className={`gx-card ${className ?? ''}`}>{children}</Tag>;
}

/** A small pill/label. */
export function Chip({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'err';
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-surface-2 text-muted border-border',
    accent: 'bg-accent-soft text-accent border-transparent',
    ok: 'text-ok border-transparent',
    warn: 'text-warn border-transparent',
    err: 'text-err border-transparent',
  };
  const tint =
    tone === 'ok'
      ? 'bg-ok/10'
      : tone === 'warn'
        ? 'bg-warn/10'
        : tone === 'err'
          ? 'bg-err/10'
          : '';
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${tint} ${className ?? ''}`}
    >
      {children}
    </span>
  );
}

/** A callout / note box. */
export function Callout({
  children,
  tone = 'accent',
  title,
}: {
  children: ReactNode;
  tone?: 'accent' | 'warn' | 'neutral';
  title?: ReactNode;
}) {
  const ring =
    tone === 'warn'
      ? 'border-warn/40 bg-warn/5'
      : tone === 'neutral'
        ? 'border-border bg-surface-2'
        : 'border-accent/30 bg-accent-soft';
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm leading-relaxed ${ring}`}>
      {title && <div className="mb-1 font-semibold text-text">{title}</div>}
      <div className="text-muted">{children}</div>
    </div>
  );
}

/** A keyboard key hint. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-border-strong bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted shadow-sm">
      {children}
    </kbd>
  );
}

/** A subtle eyebrow/kicker label. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`text-xs font-semibold uppercase tracking-[0.14em] text-accent ${className ?? ''}`}
    >
      {children}
    </div>
  );
}

/** A simple loading spinner. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-accent ${className ?? ''}`}
      role="status"
      aria-label="loading"
    />
  );
}
