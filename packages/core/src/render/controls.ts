/**
 * Zero-dependency, themed DOM control toolkit for slicer visuals.
 *
 * Slicers (dropdown / search / list / range / dateRange) are *interactive* DOM
 * widgets rather than canvas marks, so — like the table renderer — they live in
 * the surface's HTML `overlay`. That overlay is `pointer-events:none` by default
 * (so canvas charts get raw pointer events); every slicer therefore mounts a
 * host whose `pointerEvents` is restored to `auto`.
 *
 * The kit is intentionally small and self-contained: native focusable inputs for
 * accessibility, inline styles from {@link ThemeTokens} (no global stylesheet),
 * and a hand-rolled dual-thumb range slider (no `<input type=range>` because its
 * thumb can't be themed without a stylesheet). All factories return real
 * elements the caller wires up.
 */

import type { Surface } from './surface';
import type { ThemeTokens } from '../theme';
import type { Rect, Size } from '../types';
import { fontString } from './text';
import { CHROME_PAD, resolveTitle } from '../charts/chrome';

/** A mounted slicer frame: an interactive host with a header and a body. */
export interface SlicerShell {
  /** The pointer-enabled host filling the surface (appended to the overlay). */
  host: HTMLDivElement;
  /** The scrollable body where the control's guts go. */
  body: HTMLDivElement;
  /** Set/replace the right-aligned clear ("×") affordance in the header. */
  setClear(onClear: (() => void) | null): void;
}

/**
 * Mount a standard slicer frame into the overlay: a titled, padded, pointer-
 * enabled card with an optional label/clear header and a flexible body. The
 * header shows the slicer's `title` (falling back to `label`); a clear button is
 * added on demand via {@link SlicerShell.setClear}.
 */
export function mountSlicerShell(
  surface: Surface,
  tokens: ThemeTokens,
  size: Size,
  opts: { title?: unknown; label?: string } = {},
): SlicerShell {
  const c = tokens.color;
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${size.width}px`,
    height: `${size.height}px`,
    boxSizing: 'border-box',
    padding: `${CHROME_PAD.top}px ${CHROME_PAD.right}px ${CHROME_PAD.bottom}px ${CHROME_PAD.left}px`,
    display: 'flex',
    flexDirection: 'column',
    gap: `${tokens.spacing.sm}px`,
    pointerEvents: 'auto',
    color: c.text,
    font: fontString(tokens.font.size.base, tokens.font.family, tokens.font.weight.normal),
  } as Partial<CSSStyleDeclaration>);

  const title = resolveTitle(opts.title);
  const labelText = title.text ?? opts.label;

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: `${tokens.spacing.sm}px`,
    flex: '0 0 auto',
    minHeight: '0',
  } as Partial<CSSStyleDeclaration>);

  const labelEl = document.createElement('div');
  labelEl.textContent = labelText ?? '';
  Object.assign(labelEl.style, {
    font: fontString(
      title.text ? tokens.font.size.large : tokens.font.size.small,
      tokens.font.family,
      title.text ? tokens.font.weight.bold : tokens.font.weight.medium,
    ),
    color: title.text ? c.text : c.textMuted,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as Partial<CSSStyleDeclaration>);
  if (title.subtitle) labelEl.title = title.subtitle;

  const clearSlot = document.createElement('div');
  clearSlot.style.flex = '0 0 auto';

  header.appendChild(labelEl);
  header.appendChild(clearSlot);

  const body = document.createElement('div');
  Object.assign(body.style, {
    flex: '1 1 auto',
    minHeight: '0',
    display: 'flex',
    flexDirection: 'column',
    gap: `${tokens.spacing.xs}px`,
  } as Partial<CSSStyleDeclaration>);

  if (labelText) host.appendChild(header);
  host.appendChild(body);
  surface.overlay.appendChild(host);

  return {
    host,
    body,
    setClear(onClear) {
      clearSlot.replaceChildren();
      if (!onClear) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Clear';
      btn.setAttribute('aria-label', 'Clear selection');
      Object.assign(btn.style, {
        appearance: 'none',
        border: 'none',
        background: 'transparent',
        color: c.accent,
        cursor: 'pointer',
        padding: '0',
        font: fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium),
      } as Partial<CSSStyleDeclaration>);
      btn.addEventListener('click', onClear);
      clearSlot.appendChild(btn);
    },
  };
}

/** Common visual reset + focus ring shared by inputs and buttons. */
function applyFieldStyle(el: HTMLElement, tokens: ThemeTokens): void {
  const c = tokens.color;
  Object.assign(el.style, {
    appearance: 'none',
    boxSizing: 'border-box',
    width: '100%',
    background: c.background,
    color: c.text,
    border: `1px solid ${c.border}`,
    borderRadius: `${tokens.radius.md}px`,
    padding: `${tokens.spacing.xs + 2}px ${tokens.spacing.sm}px`,
    font: fontString(tokens.font.size.base, tokens.font.family, tokens.font.weight.normal),
    outline: 'none',
  } as Partial<CSSStyleDeclaration>);
  el.addEventListener('focus', () => {
    el.style.borderColor = c.accent;
    el.style.boxShadow = `0 0 0 2px ${withAlpha(c.accent, 0.25)}`;
  });
  el.addEventListener('blur', () => {
    el.style.borderColor = c.border;
    el.style.boxShadow = 'none';
  });
}

/** A themed single-line text input. */
export function makeTextInput(
  tokens: ThemeTokens,
  opts: { placeholder?: string; value?: string; type?: string } = {},
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = opts.type ?? 'text';
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (opts.value != null) input.value = opts.value;
  applyFieldStyle(input, tokens);
  return input;
}

/**
 * A themed "select" trigger (the closed dropdown button). It looks like a field
 * and shows a caret; the caller opens a popover on click.
 */
export function makeSelectButton(tokens: ThemeTokens, label: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  applyFieldStyle(btn, tokens);
  Object.assign(btn.style, {
    cursor: 'pointer',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: `${tokens.spacing.sm}px`,
  } as Partial<CSSStyleDeclaration>);
  const text = document.createElement('span');
  text.textContent = label;
  Object.assign(text.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as Partial<CSSStyleDeclaration>);
  const caret = document.createElement('span');
  caret.textContent = '▾';
  caret.style.color = tokens.color.textMuted;
  caret.style.flex = '0 0 auto';
  btn.appendChild(text);
  btn.appendChild(caret);
  return btn;
}

/** A themed floating popover surface (for dropdown menus). */
export function makePopover(tokens: ThemeTokens): HTMLDivElement {
  const c = tokens.color;
  const pop = document.createElement('div');
  Object.assign(pop.style, {
    position: 'absolute',
    zIndex: '20',
    background: c.surface,
    border: `1px solid ${c.border}`,
    borderRadius: `${tokens.radius.md}px`,
    boxShadow: tokens.dark
      ? '0 8px 24px rgba(0,0,0,0.5)'
      : '0 8px 24px rgba(15,23,42,0.16)',
    padding: `${tokens.spacing.xs}px`,
    overflowY: 'auto',
    pointerEvents: 'auto',
  } as Partial<CSSStyleDeclaration>);
  return pop;
}

/** One selectable row inside a popover/list. Returns the row element. */
export function makeOptionRow(
  tokens: ThemeTokens,
  opts: {
    label: string;
    selected: boolean;
    checkbox?: boolean;
    onToggle: () => void;
  },
): HTMLElement {
  const c = tokens.color;
  const row = document.createElement(opts.checkbox ? 'label' : 'div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: `${tokens.spacing.sm}px`,
    padding: `${tokens.spacing.xs + 1}px ${tokens.spacing.sm}px`,
    borderRadius: `${tokens.radius.sm}px`,
    cursor: 'pointer',
    color: c.text,
    whiteSpace: 'nowrap',
    userSelect: 'none',
  } as Partial<CSSStyleDeclaration>);
  row.addEventListener('mouseenter', () => {
    row.style.background = withAlpha(c.accent, tokens.dark ? 0.18 : 0.1);
  });
  row.addEventListener('mouseleave', () => {
    row.style.background = opts.selected && !opts.checkbox ? withAlpha(c.accent, 0.14) : 'transparent';
  });

  if (opts.checkbox) {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = opts.selected;
    box.style.accentColor = c.accent;
    box.style.flex = '0 0 auto';
    box.style.margin = '0';
    box.addEventListener('change', () => opts.onToggle());
    row.appendChild(box);
  } else {
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(opts.selected));
    if (opts.selected) row.style.background = withAlpha(c.accent, 0.14);
    row.addEventListener('click', () => opts.onToggle());
  }

  const text = document.createElement('span');
  text.textContent = opts.label;
  Object.assign(text.style, {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as Partial<CSSStyleDeclaration>);
  row.appendChild(text);
  return row;
}

/** A small pill button used for relative presets (e.g. "Last 7 days"). */
export function makeChip(tokens: ThemeTokens, label: string, active = false): HTMLButtonElement {
  const c = tokens.color;
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.textContent = label;
  Object.assign(chip.style, {
    appearance: 'none',
    cursor: 'pointer',
    borderRadius: `${tokens.radius.sm}px`,
    border: `1px solid ${active ? c.accent : c.border}`,
    background: active ? withAlpha(c.accent, 0.16) : 'transparent',
    color: active ? c.accent : c.textMuted,
    padding: `${tokens.spacing.xs}px ${tokens.spacing.sm}px`,
    font: fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium),
    whiteSpace: 'nowrap',
  } as Partial<CSSStyleDeclaration>);
  return chip;
}

export interface DualSlider {
  /** The slider element to append. */
  el: HTMLDivElement;
  /** Programmatically set the thumbs (does not fire `onChange`). */
  set(low: number, high: number): void;
}

/**
 * A hand-rolled dual-thumb range slider over `[min, max]`. Thumbs are focusable
 * (`role=slider`, arrow-key steppable) and drag with a pointer; `onInput` fires
 * continuously (for live labels), `onChange` on release / keypress (to publish).
 * `format` renders the live value labels above the thumbs.
 */
export function makeDualSlider(
  tokens: ThemeTokens,
  opts: {
    min: number;
    max: number;
    step?: number;
    low: number;
    high: number;
    format?: (v: number) => string;
    onInput?: (low: number, high: number) => void;
    onChange: (low: number, high: number) => void;
  },
): DualSlider {
  const c = tokens.color;
  const span = Math.max(1e-9, opts.max - opts.min);
  const step = opts.step && opts.step > 0 ? opts.step : span / 100;
  const fmt = opts.format ?? ((v: number) => String(Math.round(v)));
  let low = clamp(opts.low, opts.min, opts.max);
  let high = clamp(opts.high, low, opts.max);

  const wrap = document.createElement('div');
  Object.assign(wrap.style, {
    position: 'relative',
    width: '100%',
    paddingTop: `${tokens.font.size.small + 6}px`,
    height: `${tokens.font.size.small + 6 + 18}px`,
    boxSizing: 'border-box',
  } as Partial<CSSStyleDeclaration>);

  const track = document.createElement('div');
  Object.assign(track.style, {
    position: 'absolute',
    left: '8px',
    right: '8px',
    top: `${tokens.font.size.small + 6 + 7}px`,
    height: '4px',
    borderRadius: '2px',
    background: c.border,
  } as Partial<CSSStyleDeclaration>);

  const fill = document.createElement('div');
  Object.assign(fill.style, {
    position: 'absolute',
    top: '0',
    height: '4px',
    borderRadius: '2px',
    background: c.accent,
  } as Partial<CSSStyleDeclaration>);
  track.appendChild(fill);

  const labels = document.createElement('div');
  Object.assign(labels.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: '0',
    display: 'flex',
    justifyContent: 'space-between',
    font: fontString(tokens.font.size.small, tokens.font.family, tokens.font.weight.medium),
    color: c.textMuted,
  } as Partial<CSSStyleDeclaration>);
  const lowLabel = document.createElement('span');
  const highLabel = document.createElement('span');
  labels.appendChild(lowLabel);
  labels.appendChild(highLabel);

  const makeThumb = (label: string): HTMLDivElement => {
    const t = document.createElement('div');
    t.tabIndex = 0;
    t.setAttribute('role', 'slider');
    t.setAttribute('aria-label', label);
    t.setAttribute('aria-valuemin', String(opts.min));
    t.setAttribute('aria-valuemax', String(opts.max));
    Object.assign(t.style, {
      position: 'absolute',
      top: `${tokens.font.size.small + 6 + 1}px`,
      width: '16px',
      height: '16px',
      marginLeft: '-8px',
      borderRadius: '50%',
      background: c.background,
      border: `2px solid ${c.accent}`,
      boxShadow: tokens.dark ? '0 1px 3px rgba(0,0,0,0.6)' : '0 1px 3px rgba(15,23,42,0.25)',
      cursor: 'pointer',
      touchAction: 'none',
      outline: 'none',
    } as Partial<CSSStyleDeclaration>);
    t.addEventListener('focus', () => {
      t.style.boxShadow = `0 0 0 3px ${withAlpha(c.accent, 0.3)}`;
    });
    t.addEventListener('blur', () => {
      t.style.boxShadow = tokens.dark ? '0 1px 3px rgba(0,0,0,0.6)' : '0 1px 3px rgba(15,23,42,0.25)';
    });
    return t;
  };

  const thumbLow = makeThumb('Minimum');
  const thumbHigh = makeThumb('Maximum');

  wrap.appendChild(track);
  wrap.appendChild(labels);
  wrap.appendChild(thumbLow);
  wrap.appendChild(thumbHigh);

  const pct = (v: number): number => ((v - opts.min) / span) * 100;
  const paint = (): void => {
    const lo = pct(low);
    const hi = pct(high);
    thumbLow.style.left = thumbLeftCss(lo);
    thumbHigh.style.left = thumbLeftCss(hi);
    fill.style.left = `${lo}%`;
    fill.style.width = `${Math.max(0, hi - lo)}%`;
    lowLabel.textContent = fmt(low);
    highLabel.textContent = fmt(high);
    thumbLow.setAttribute('aria-valuenow', String(low));
    thumbHigh.setAttribute('aria-valuenow', String(high));
  };
  paint();

  const quantize = (v: number): number => {
    const snapped = Math.round((v - opts.min) / step) * step + opts.min;
    return clamp(snapped, opts.min, opts.max);
  };

  const dragThumb = (which: 'low' | 'high', startEvent: PointerEvent): void => {
    startEvent.preventDefault();
    const rect = track.getBoundingClientRect();
    const move = (e: PointerEvent): void => {
      const ratio = rect.width <= 0 ? 0 : (e.clientX - rect.left) / rect.width;
      const v = quantize(opts.min + ratio * span);
      if (which === 'low') low = clamp(v, opts.min, high);
      else high = clamp(v, low, opts.max);
      paint();
      opts.onInput?.(low, high);
    };
    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      opts.onChange(low, high);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  thumbLow.addEventListener('pointerdown', (e) => dragThumb('low', e));
  thumbHigh.addEventListener('pointerdown', (e) => dragThumb('high', e));

  const key = (which: 'low' | 'high') => (e: KeyboardEvent): void => {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    if (which === 'low') low = clamp(quantize(low + dir * step), opts.min, high);
    else high = clamp(quantize(high + dir * step), low, opts.max);
    paint();
    opts.onInput?.(low, high);
    opts.onChange(low, high);
  };
  thumbLow.addEventListener('keydown', key('low'));
  thumbHigh.addEventListener('keydown', key('high'));

  return {
    el: wrap,
    set(nextLow, nextHigh) {
      low = clamp(nextLow, opts.min, opts.max);
      high = clamp(nextHigh, low, opts.max);
      paint();
    },
  };
}

/** Place an absolutely-positioned popover under `anchor`, clamped to `host`. */
export function positionPopover(pop: HTMLDivElement, anchor: HTMLElement, host: HTMLElement): void {
  const a = anchor.getBoundingClientRect();
  const h = host.getBoundingClientRect();
  pop.style.left = `${a.left - h.left}px`;
  pop.style.top = `${a.bottom - h.top + 4}px`;
  pop.style.width = `${a.width}px`;
  const maxH = Math.max(80, h.bottom - a.bottom - 8);
  pop.style.maxHeight = `${maxH}px`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * CSS `left` for a dual-slider thumb whose center sits at `pct` (0–100) along a
 * track inset 8px on each side; the 16px thumb is centered via `marginLeft:-8px`.
 *
 * The multiplier MUST be a unitless `<number>` — `calc(<percentage> * <length>)`
 * is invalid CSS and would be silently dropped, collapsing both thumbs to the
 * left edge (so the slider appears to have a single handle). Exported so this
 * contract can be unit-tested without a DOM.
 */
export function thumbLeftCss(pct: number): string {
  const fraction = clamp(pct, 0, 100) / 100;
  return `calc(8px + ${fraction} * (100% - 16px))`;
}

/** Apply an alpha to a #rgb/#rrggbb color, returning an rgba() string. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  let r = 0;
  let g = 0;
  let b = 0;
  if (m6) {
    r = parseInt(m6[1], 16);
    g = parseInt(m6[2], 16);
    b = parseInt(m6[3], 16);
  } else if (m3) {
    r = parseInt(m3[1] + m3[1], 16);
    g = parseInt(m3[2] + m3[2], 16);
    b = parseInt(m3[3] + m3[3], 16);
  } else {
    return color;
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type { Rect };
