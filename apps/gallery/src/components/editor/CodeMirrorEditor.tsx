import { useEffect, useRef } from 'react';
import { json } from '@codemirror/lang-json';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { useTheme } from '../../state/theme';

function cmTheme(mode: 'light' | 'dark'): Extension {
  return EditorView.theme(
    {
      '&': {
        height: '100%',
        color: 'var(--text)',
        backgroundColor: 'transparent',
        fontFamily: 'var(--font-mono)',
        fontSize: '13px',
      },
      '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65' },
      '.cm-content': { padding: '14px 0', caretColor: 'var(--accent)' },
      '.cm-line': { padding: '0 16px' },
      '.cm-gutters': {
        backgroundColor: 'transparent',
        color: 'var(--faint)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-activeLine': { backgroundColor: 'var(--accent-soft)' },
      '.cm-activeLineGutter': { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' },
      '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
        backgroundColor: 'color-mix(in oklab, var(--spec-2) 26%, transparent)',
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-foldGutter span': { color: 'var(--faint)' },
    },
    { dark: mode === 'dark' },
  );
}

export interface CodeMirrorEditorProps {
  value: string;
  onChange(next: string): void;
  className?: string;
  ariaLabel?: string;
}

/**
 * A controlled CodeMirror 6 JSON editor wired to the gallery theme. Reused by the
 * Playground, the Learn track's "your turn" exercises, and the guides' try-it blocks.
 */
export function CodeMirrorEditor({ value, onChange, className, ariaLabel }: CodeMirrorEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeComp = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const { theme } = useTheme();

  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current || viewRef.current) return;
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) onChangeRef.current(update.state.doc.toString());
    });
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [basicSetup, json(), EditorView.lineWrapping, listener, themeComp.current.of(cmTheme(theme))],
      }),
    });
    if (ariaLabel) view.contentDOM.setAttribute('aria-label', ariaLabel);
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Keep the document in sync when the value is changed from outside (reset, reveal).
  useEffect(() => {
    const view = viewRef.current;
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeComp.current.reconfigure(cmTheme(theme)) });
  }, [theme]);

  return <div ref={hostRef} className={className} />;
}
