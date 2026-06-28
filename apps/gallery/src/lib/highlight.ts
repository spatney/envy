import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDarkDimmed from 'shiki/themes/github-dark-dimmed.mjs';
import json from 'shiki/langs/json.mjs';
import jsonc from 'shiki/langs/jsonc.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import bash from 'shiki/langs/bash.mjs';

export type CodeLang = 'json' | 'jsonc' | 'ts' | 'tsx' | 'bash';

const LIGHT = 'github-light';
const DARK = 'github-dark-dimmed';

let instance: Promise<HighlighterCore> | null = null;

// Fine-grained core highlighter: statically import only the five languages and
// two themes the gallery uses, so Vite never code-splits the full Shiki language
// set (which would emit hundreds of unused grammar chunks into the bundle).
function get(): Promise<HighlighterCore> {
  instance ??= createHighlighterCore({
    themes: [githubLight, githubDarkDimmed],
    langs: [json, jsonc, typescript, tsx, bash],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  });
  return instance;
}

const LANG_ALIAS: Record<CodeLang, string> = {
  json: 'json',
  jsonc: 'jsonc',
  ts: 'typescript',
  tsx: 'tsx',
  bash: 'bash',
};

/** Highlight `code` to themed HTML. Returns a `<pre class="shiki">…</pre>` string. */
export async function highlightCode(code: string, lang: CodeLang, dark: boolean): Promise<string> {
  const hl = await get();
  return hl.codeToHtml(code, {
    lang: LANG_ALIAS[lang],
    theme: dark ? DARK : LIGHT,
  });
}

/** Warm the highlighter so the first code block paints without a flash. */
export function warmHighlighter(): void {
  void get();
}
