import type { StoryArgs, StoryControl } from '../../stories/types';

export interface StoryControlsProps {
  controls: StoryControl[];
  args: StoryArgs;
  onChange(id: string, value: string | number | boolean): void;
  onReset(): void;
}

/** Storybook-style "knobs" that re-parameterise a story's spec live. */
export function StoryControls({ controls, args, onChange, onReset }: StoryControlsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">Controls</h3>
        <button
          type="button"
          onClick={onReset}
          className="text-xs font-medium text-faint transition-colors hover:text-text"
        >
          Reset
        </button>
      </div>
      <div className="space-y-3.5">
        {controls.map((c) => (
          <div key={c.id} className="space-y-1.5">
            <label className="flex items-center justify-between text-sm text-muted">
              <span>{c.label}</span>
              {c.kind === 'range' && (
                <span className="font-mono text-xs tabular-nums text-faint">{String(args[c.id])}</span>
              )}
            </label>
            {c.kind === 'toggle' && (
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(args[c.id])}
                onClick={() => onChange(c.id, !args[c.id])}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  args[c.id] ? 'bg-accent' : 'bg-surface-3'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    args[c.id] ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            )}
            {c.kind === 'select' && (
              <select
                value={String(args[c.id])}
                onChange={(e) => onChange(c.id, e.target.value)}
                className="w-full rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text outline-none focus:border-accent"
              >
                {c.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label ?? o.value}
                  </option>
                ))}
              </select>
            )}
            {c.kind === 'range' && (
              <input
                type="range"
                min={c.min}
                max={c.max}
                step={c.step ?? 1}
                value={Number(args[c.id])}
                onChange={(e) => onChange(c.id, Number(e.target.value))}
                className="w-full accent-accent"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
