import type { ReactNode } from 'react';
import { Kicker } from './primitives';

export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto w-full ${wide ? 'max-w-7xl' : 'max-w-6xl'} px-5 py-8 sm:px-8`}>
      {children}
    </div>
  );
}

export function PageHeader({
  kicker,
  title,
  blurb,
}: {
  kicker?: string;
  title: string;
  blurb?: ReactNode;
}) {
  return (
    <header className="mb-7 gx-rise">
      {kicker && <Kicker>{kicker}</Kicker>}
      <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight text-text sm:text-4xl">
        {title}
      </h1>
      {blurb && <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted">{blurb}</p>}
    </header>
  );
}
