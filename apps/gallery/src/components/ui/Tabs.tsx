import { useId, useState, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  initial?: string;
  /** Extra classes for the tab strip. */
  stripClassName?: string;
}

/** A small accessible tab group used across story + feature pages. */
export function Tabs({ tabs, initial, stripClassName }: TabsProps) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const base = useId();
  const current = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      <div
        role="tablist"
        className={`flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-1 ${stripClassName ?? ''}`}
      >
        {tabs.map((t) => {
          const selected = t.id === current?.id;
          return (
            <button
              key={t.id}
              role="tab"
              id={`${base}-${t.id}-tab`}
              aria-selected={selected}
              aria-controls={`${base}-${t.id}-panel`}
              type="button"
              onClick={() => setActive(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selected
                  ? 'bg-surface text-text shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${base}-${current?.id}-panel`}
        aria-labelledby={`${base}-${current?.id}-tab`}
        className="mt-4"
      >
        {current?.content}
      </div>
    </div>
  );
}
