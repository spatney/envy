/**
 * Playground — an interactive editor where you can author a ChartSpec (with
 * inline data), preview it live on a drag-resizable surface, seed it from a
 * catalog of presets (chart type × data size), and shuffle the data to watch
 * the update transitions.
 */

import {
  render,
  renderDashboard,
  validateSpec,
  type ChartSpec,
  type ChartInstance,
  type DashboardInstance,
  type DashboardSpec,
} from 'graphein';
import { presetGroups, presetById, presets, type Preset } from './presets';

interface MountOpts {
  theme: 'light' | 'dark';
}

export interface PlaygroundHandle {
  dispose(): void;
}

// Persist across re-mounts (e.g. theme toggle) so edits aren't lost.
let savedText: string | null = null;
let savedPresetId = presets[0].id;
let savedW = 0;
let savedH = 0;

function deepDate(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(deepDate);
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = deepDate(val);
    return o;
  }
  return v;
}

function toEditable(spec: ChartSpec | DashboardSpec): string {
  return JSON.stringify(deepDate(spec), null, 2);
}

/**
 * Seed the playground's editor with a spec before it next mounts — powers the
 * detail page's "Edit in Playground" action. Stored in the same module-level
 * slot the editor restores from, so navigating to the Playground route picks it
 * up exactly as if the user had typed it.
 */
export function loadIntoPlayground(spec: ChartSpec | DashboardSpec): void {
  savedText = toEditable(spec);
}

/** Perturb every numeric leaf inside `data` by ±~18% (keeps shape, animates). */
function shuffleData(spec: Record<string, unknown>): Record<string, unknown> {
  const data = spec.data;
  if (!Array.isArray(data)) return spec;
  const jitter = (n: number): number => {
    const next = n * (0.82 + Math.random() * 0.36);
    return Math.round(next * 100) / 100;
  };
  const nextData = data.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const o: Record<string, unknown> = { ...(row as Record<string, unknown>) };
    for (const [k, val] of Object.entries(o)) if (typeof val === 'number') o[k] = jitter(val);
    return o;
  });
  return { ...spec, data: nextData };
}

export function mountPlayground(mainEl: HTMLElement, opts: MountOpts): PlaygroundHandle {
  mainEl.innerHTML = '';

  let instance: ChartInstance | DashboardInstance | undefined;
  let renderedType: string | undefined;
  let debounce: number | undefined;
  let disposed = false;

  // ---- Toolbar -------------------------------------------------------------
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <div class="title-group">
      <h2>Playground</h2>
      <p class="sub">Edit a ChartSpec, preview live, drag to resize.</p>
    </div>
    <div class="spacer"></div>`;

  const presetSelect = document.createElement('select');
  presetSelect.className = 'select';
  presetSelect.title = 'Load a preset';
  for (const { group, items } of presetGroups()) {
    const og = document.createElement('optgroup');
    og.label = group;
    for (const p of items) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.label} — ${p.note}`;
      og.appendChild(opt);
    }
    presetSelect.appendChild(og);
  }
  presetSelect.value = savedPresetId;

  const shuffleBtn = document.createElement('button');
  shuffleBtn.className = 'btn';
  shuffleBtn.innerHTML = '⤮ Shuffle data';
  shuffleBtn.title = 'Randomize the data to see update animations';

  // Sketch toggle — flips the `sketch` field on the edited spec so the change is
  // reflected in the JSON (and in Copy), then re-renders.
  const sketchBtn = document.createElement('button');
  function syncSketchBtn(on: boolean): void {
    sketchBtn.className = 'btn' + (on ? ' active' : '');
    sketchBtn.textContent = on ? '✏ Sketch: on' : '✐ Sketch: off';
  }
  syncSketchBtn(false);
  sketchBtn.title = 'Toggle the hand-drawn sketch renderer';
  sketchBtn.onclick = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(textarea.value) as Record<string, unknown>;
    } catch {
      return; // invalid JSON — nothing to toggle
    }
    if (parsed.sketch) delete parsed.sketch;
    else parsed.sketch = true;
    textarea.value = JSON.stringify(parsed, null, 2);
    renderFromText(textarea.value);
  };

  toolbar.append(presetSelect, shuffleBtn, sketchBtn);
  mainEl.appendChild(toolbar);

  // ---- Split body ----------------------------------------------------------
  const body = document.createElement('div');
  body.className = 'pg-body';

  // Editor pane
  const editorPane = document.createElement('div');
  editorPane.className = 'pg-editor';
  const editorHead = document.createElement('div');
  editorHead.className = 'pg-pane-head';
  editorHead.innerHTML = '<span class="pg-pane-title">ChartSpec</span>';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-ghost btn-sm';
  copyBtn.textContent = 'Copy';
  editorHead.appendChild(copyBtn);
  const textarea = document.createElement('textarea');
  textarea.className = 'pg-textarea';
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  const status = document.createElement('div');
  status.className = 'pg-status';
  editorPane.append(editorHead, textarea, status);

  // Preview pane
  const previewPane = document.createElement('div');
  previewPane.className = 'pg-preview';
  const previewHead = document.createElement('div');
  previewHead.className = 'pg-pane-head';
  previewHead.innerHTML = '<span class="pg-pane-title">Preview</span>';
  const sizeBadge = document.createElement('span');
  sizeBadge.className = 'pg-size';
  previewHead.appendChild(sizeBadge);
  const stage = document.createElement('div');
  stage.className = 'pg-stage';
  const frame = document.createElement('div');
  frame.className = 'pg-frame';
  const host = document.createElement('div');
  host.className = 'pg-host';
  frame.appendChild(host);
  stage.appendChild(frame);
  const hint = document.createElement('div');
  hint.className = 'pg-hint';
  hint.textContent = '↘ drag the corner to resize';
  stage.appendChild(hint);
  previewPane.append(previewHead, stage);

  body.append(editorPane, previewPane);
  mainEl.appendChild(body);

  if (savedW && savedH) {
    frame.style.width = `${savedW}px`;
    frame.style.height = `${savedH}px`;
  }

  // ---- Rendering -----------------------------------------------------------
  function setStatus(kind: 'ok' | 'warn' | 'err', label: string, detail?: string): void {
    status.className = `pg-status pg-status-${kind}`;
    status.innerHTML = `<span class="pg-badge">${label}</span>${detail ? `<span class="pg-detail">${detail}</span>` : ''}`;
  }

  function renderFromText(text: string): void {
    savedText = text;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch (e) {
      setStatus('err', 'Invalid JSON', (e as Error).message);
      return;
    }

    const result = validateSpec(parsed);
    syncSketchBtn(Boolean(parsed.sketch));
    const previewSpec = (() => {
      const clone: Record<string, unknown> = { ...parsed, theme: opts.theme };
      delete clone.dimensions;
      return clone as unknown as ChartSpec;
    })();

    try {
      const type = typeof parsed.type === 'string' ? parsed.type : undefined;
      const isDash = type === 'dashboard';
      if (instance && renderedType === type) {
        if (isDash) (instance as DashboardInstance).update(previewSpec as unknown as DashboardSpec);
        else (instance as ChartInstance).update(previewSpec);
      } else {
        instance?.destroy();
        instance = isDash
          ? renderDashboard(host, previewSpec as unknown as DashboardSpec)
          : render(host, previewSpec);
        renderedType = type;
      }
    } catch (e) {
      instance?.destroy();
      instance = undefined;
      renderedType = undefined;
      setStatus('err', 'Render error', (e as Error).message);
      return;
    }

    if (!result.valid) {
      const first = result.errors[0];
      setStatus('err', `${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`, first ? `${first.path || 'spec'}: ${first.message}` : '');
    } else if (result.warnings.length) {
      const first = result.warnings[0];
      setStatus('warn', `${result.warnings.length} warning${result.warnings.length > 1 ? 's' : ''}`, first ? `${first.path || 'spec'}: ${first.message}` : '');
    } else {
      setStatus('ok', 'Valid', `${(parsed.type as string) ?? 'chart'} · ${Array.isArray(parsed.data) ? parsed.data.length : 0} rows`);
    }
  }

  function scheduleRender(): void {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => renderFromText(textarea.value), 220);
  }

  function loadPreset(id: string): void {
    const p: Preset | undefined = presetById(id);
    if (!p) return;
    savedPresetId = id;
    const text = toEditable(p.build());
    textarea.value = text;
    // Force a fresh render (type likely changed).
    instance?.destroy();
    instance = undefined;
    renderedType = undefined;
    renderFromText(text);
  }

  // ---- Wires ---------------------------------------------------------------
  textarea.addEventListener('input', scheduleRender);
  presetSelect.addEventListener('change', () => loadPreset(presetSelect.value));
  shuffleBtn.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(textarea.value) as Record<string, unknown>;
      const next = shuffleData(parsed);
      textarea.value = JSON.stringify(next, null, 2);
      renderFromText(textarea.value);
    } catch {
      /* ignore — invalid JSON, nothing to shuffle */
    }
  });
  copyBtn.addEventListener('click', () => {
    void navigator.clipboard?.writeText(textarea.value);
    copyBtn.textContent = 'Copied';
    window.setTimeout(() => (copyBtn.textContent = 'Copy'), 1200);
  });

  const ro = new ResizeObserver(() => {
    const w = Math.round(frame.clientWidth);
    const h = Math.round(frame.clientHeight);
    savedW = w;
    savedH = h;
    sizeBadge.textContent = `${w} × ${h}`;
    instance?.resize();
  });
  ro.observe(frame);

  // ---- Initial paint -------------------------------------------------------
  if (savedText) {
    textarea.value = savedText;
    renderFromText(savedText);
  } else {
    loadPreset(savedPresetId);
  }

  return {
    dispose(): void {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(debounce);
      ro?.disconnect();
      instance?.destroy();
      instance = undefined;
    },
  };
}
