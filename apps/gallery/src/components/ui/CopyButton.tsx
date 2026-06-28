import { useCallback, useState } from 'react';

export interface CopyButtonProps {
  /** Text to copy, or a getter for it. */
  value: string | (() => string);
  className?: string;
  label?: string;
  copiedLabel?: string;
}

/** A small copy-to-clipboard button with transient "Copied" feedback. */
export function CopyButton({
  value,
  className,
  label = 'Copy',
  copiedLabel = 'Copied',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const onClick = useCallback(() => {
    const text = typeof value === 'function' ? value() : value;
    void navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [value]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        'inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:text-text hover:border-border-strong'
      }
      aria-live="polite"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
