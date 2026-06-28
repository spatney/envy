import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchIndex, type SearchEntry } from '../../nav';

interface GroupedResults {
  group: string;
  entries: { entry: SearchEntry; index: number }[];
}

const optionId = (index: number) => `gx-command-option-${index}`;

export function CommandPalette({ open, onClose }: { open: boolean; onClose(): void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const entries = useMemo(() => searchIndex(), []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 12);
    const scored = entries
      .map((e) => ({ e, i: e.keywords.toLowerCase().indexOf(q) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i || a.e.label.length - b.e.label.length);
    return scored.slice(0, 30).map((x) => x.e);
  }, [query, entries]);

  const grouped = useMemo<GroupedResults[]>(() => {
    const map = new Map<string, { entry: SearchEntry; index: number }[]>();
    results.forEach((entry, index) => {
      const group = entry.to.startsWith('/charts/') ? `Charts · ${entry.group}` : 'Pages';
      const current = map.get(group) ?? [];
      current.push({ entry, index });
      map.set(group, current);
    });
    return Array.from(map, ([group, groupEntries]) => ({ group, entries: groupEntries }));
  }, [results]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, open]);

  if (!open) return null;

  const go = (entry: SearchEntry | undefined) => {
    if (!entry) return;
    navigate(entry.to);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--scrim)] p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (results.length ? (a + 1) % results.length : 0));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (results.length ? (a - 1 + results.length) % results.length : 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              go(results[active]);
            } else if (e.key === 'Escape') {
              onClose();
            }
          }}
          placeholder="Search charts, pages, features…"
          role="combobox"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="gx-command-results"
          aria-activedescendant={results[active] ? optionId(active) : undefined}
          aria-label="Search gallery pages and charts"
          className="w-full border-b border-border bg-transparent px-4 py-3.5 text-sm text-text outline-none placeholder:text-faint"
        />
        <ul id="gx-command-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-faint">No matches</li>
          )}
          {grouped.map((group) => {
            return (
              <li key={group.group} role="presentation" className="py-1">
                <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                  {group.group}
                </div>
                <ul role="group" aria-label={group.group}>
                  {group.entries.map(({ entry, index: i }) => {
                    return (
                      <li key={entry.to} role="presentation">
                        <button
                          id={optionId(i)}
                          type="button"
                          role="option"
                          aria-selected={i === active}
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(entry)}
                          className={`flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            i === active
                              ? 'bg-accent-soft text-accent'
                              : 'text-text hover:bg-surface-2'
                          }`}
                        >
                          <span className="min-w-0 truncate">{entry.label}</span>
                          <span className="shrink-0 text-xs text-faint">{entry.group}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
