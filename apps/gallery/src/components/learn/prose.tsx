import type { ReactNode } from 'react';
import { CodeBlock } from '../ui/CodeBlock';
import type { CodeLang } from '../../lib/highlight';

/** Lead paragraph for a chapter concept. */
export function Lead({ children }: { children: ReactNode }) {
  return <p className="text-base leading-relaxed text-muted">{children}</p>;
}

/** Body paragraph. */
export function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted">{children}</p>;
}

/** A sub-heading inside a concept. */
export function H({ children }: { children: ReactNode }) {
  return <h3 className="font-display text-base font-semibold text-text">{children}</h3>;
}

/** Inline code token. */
export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-accent">{children}</code>;
}

/** A code snippet inside a concept. */
export function Snippet({ code, lang = 'json', title }: { code: string; lang?: CodeLang; title?: string }) {
  return <CodeBlock code={code} lang={lang} title={title} />;
}

/** A compact bullet list. */
export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
