import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import { Link } from 'react-router-dom';

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

/** A subtle eyebrow/kicker label with a small spectrum dot. */
export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent ${className ?? ''}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'var(--grad-brand)' }} aria-hidden="true" />
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

/** Brand headline text filled with the spectrum gradient. */
export function GradientText({
  children,
  animate,
  className,
  as: Tag = 'span',
}: {
  children: ReactNode;
  animate?: boolean;
  className?: string;
  as?: ElementType;
}) {
  return <Tag className={`${animate ? 'spectrum-pan' : 'spectrum-text'} ${className ?? ''}`}>{children}</Tag>;
}

/** A thin spectrum rule used as a section/brand divider. */
export function SpectrumBar({ className }: { className?: string }) {
  return <div className={`spectrum-rule ${className ?? ''}`} aria-hidden="true" />;
}

type ButtonVariant = 'spectrum' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50';
const BTN_VARIANT: Record<ButtonVariant, string> = {
  spectrum: 'spectrum-fill shadow-[var(--shadow-glow)] hover:brightness-110 hover:-translate-y-px',
  outline: 'border border-border-strong bg-surface text-text hover:border-accent hover:text-accent',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-[15px]',
};

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}

/** A spectrum/outline/ghost button rendered as a router link. */
export function ButtonLink({
  to,
  external,
  variant = 'spectrum',
  size = 'md',
  className,
  children,
}: ButtonOwnProps & { to: string; external?: boolean }) {
  const cls = `${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className ?? ''}`;
  if (external) {
    return (
      <a href={to} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={cls}>
      {children}
    </Link>
  );
}

/** A spectrum/outline/ghost <button>. */
export function Button({
  variant = 'spectrum',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonOwnProps & ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      className={`${BTN_BASE} ${BTN_VARIANT[variant]} ${BTN_SIZE[size]} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** A section heading block: eyebrow + title + optional lead paragraph. */
export function SectionHeader({
  eyebrow,
  title,
  lead,
  align = 'left',
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  align?: 'left' | 'center';
  className?: string;
}) {
  return (
    <div className={`${align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-3xl'} ${className ?? ''}`}>
      {eyebrow && <Kicker className={align === 'center' ? 'justify-center' : ''}>{eyebrow}</Kicker>}
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-text sm:text-3xl">{title}</h2>
      {lead && <p className="mt-3 text-base leading-relaxed text-muted sm:text-lg">{lead}</p>}
    </div>
  );
}

/** A labelled statistic (big number + caption). */
export function Stat({
  value,
  label,
  gradient,
}: {
  value: ReactNode;
  label: ReactNode;
  gradient?: boolean;
}) {
  return (
    <div>
      <div className={`font-display text-3xl font-semibold tracking-tight ${gradient ? 'spectrum-text' : 'text-text'}`}>
        {value}
      </div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-faint">{label}</div>
    </div>
  );
}
