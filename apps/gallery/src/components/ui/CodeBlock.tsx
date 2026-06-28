import { useEffect, useState } from 'react';
import { highlightCode, type CodeLang } from '../../lib/highlight';
import { useTheme } from '../../state/theme';
import { CopyButton } from './CopyButton';

export interface CodeBlockProps {
  code: string;
  lang?: CodeLang;
  /** Optional caption shown in the header strip. */
  title?: string;
  copy?: boolean;
  className?: string;
  /** Cap the height and scroll (e.g. for long specs). */
  maxHeight?: number;
}

/**
 * A syntax-highlighted code block (Shiki) that re-themes with the gallery and
 * offers copy-to-clipboard. Renders plain (escaped) text until highlighting
 * resolves, so it never flashes unstyled or blocks paint.
 */
export function CodeBlock({
  code,
  lang = 'ts',
  title,
  copy = true,
  className,
  maxHeight,
}: CodeBlockProps) {
  const { theme } = useTheme();
  const dark = theme === 'dark';
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void highlightCode(code, lang, dark).then((out) => {
      if (alive) setHtml(out);
    });
    return () => {
      alive = false;
    };
  }, [code, lang, dark]);

  return (
    <div className={`overflow-hidden rounded-xl border border-border bg-surface ${className ?? ''}`}>
      {(title || copy) && (
        <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
          <span className="font-mono text-[11px] font-medium uppercase tracking-wide text-faint">
            {title ?? lang}
          </span>
          {copy && <CopyButton value={code} />}
        </div>
      )}
      <div
        className="gx-code overflow-auto text-[13px] leading-relaxed"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {html ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="m-0 p-4 font-mono text-text">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
