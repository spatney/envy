// @vitest-environment jsdom
import { beforeAll, describe, it, expect, vi } from 'vitest';
import { resolveTheme } from '../theme';
import type { Surface } from './surface';
import {
  makeDualSlider,
  makeOptionRow,
  makePopover,
  makeSelectButton,
  mountSlicerShell,
  positionPopover,
  thumbLeftCss,
  withAlpha,
} from './controls';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as any;
});

describe('thumbLeftCss (dual-slider thumb positioning)', () => {
  it('emits a unitless calc multiplier at the extremes and midpoint', () => {
    expect(thumbLeftCss(0)).toBe('calc(8px + 0 * (100% - 16px))');
    expect(thumbLeftCss(50)).toBe('calc(8px + 0.5 * (100% - 16px))');
    expect(thumbLeftCss(100)).toBe('calc(8px + 1 * (100% - 16px))');
  });

  it('never multiplies a percentage by a length (the invalid-CSS regression)', () => {
    // `calc(45% * (100% - 16px))` is invalid and the browser drops `left`,
    // collapsing both thumbs to the left edge — the original single-handle bug.
    for (const p of [0, 12.5, 33.3, 66.6, 99.9, 100]) {
      expect(thumbLeftCss(p)).not.toMatch(/%\s*\*/);
    }
  });

  it('clamps out-of-range input to [0, 100]', () => {
    expect(thumbLeftCss(-10)).toBe('calc(8px + 0 * (100% - 16px))');
    expect(thumbLeftCss(150)).toBe('calc(8px + 1 * (100% - 16px))');
  });

  it('is monotonic across the track', () => {
    const at = (p: number): number => Number(/\+ ([\d.]+) \*/.exec(thumbLeftCss(p))![1]);
    expect(at(10)).toBeLessThan(at(20));
    expect(at(20)).toBeLessThan(at(90));
  });
});

describe('DOM control factories', () => {
  const tokens = resolveTheme('light');

  it('mountSlicerShell creates a pointer-enabled frame and clear affordance', () => {
    const overlay = document.createElement('div');
    const surface = { overlay } as unknown as Surface;
    const shell = mountSlicerShell(surface, tokens, { width: 240, height: 80 }, {
      title: { text: 'Region', subtitle: 'Choose regions' },
    });

    expect(overlay.firstElementChild).toBe(shell.host);
    expect(shell.host.style.pointerEvents).toBe('auto');
    expect(shell.host.textContent).toContain('Region');
    expect((shell.host.children[0].children[0] as HTMLElement).title).toBe('Choose regions');

    const onClear = vi.fn();
    shell.setClear(onClear);
    const clear = shell.host.querySelector('button[aria-label="Clear selection"]')!;
    clear.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClear).toHaveBeenCalledTimes(1);

    shell.setClear(null);
    expect(shell.host.querySelector('button[aria-label="Clear selection"]')).toBeNull();
  });

  it('makeSelectButton, makePopover, and positionPopover style/select geometry', () => {
    const host = document.createElement('div');
    const button = makeSelectButton(tokens, 'All regions');
    const pop = makePopover(tokens);
    host.append(button, pop);

    button.getBoundingClientRect = () => ({
      left: 30,
      top: 10,
      right: 150,
      bottom: 34,
      width: 120,
      height: 24,
      x: 30,
      y: 10,
      toJSON: () => ({}),
    });
    host.getBoundingClientRect = () => ({
      left: 10,
      top: 4,
      right: 260,
      bottom: 140,
      width: 250,
      height: 136,
      x: 10,
      y: 4,
      toJSON: () => ({}),
    });

    positionPopover(pop, button, host);

    expect(button.textContent).toContain('All regions');
    expect(button.textContent).toContain('▾');
    expect(pop.style.pointerEvents).toBe('auto');
    expect(pop.style.left).toBe('20px');
    expect(pop.style.top).toBe('34px');
    expect(pop.style.width).toBe('120px');
    expect(pop.style.maxHeight).toBe('98px');
  });

  it('makeOptionRow supports option and checkbox branches with hover styling', () => {
    const optionToggle = vi.fn();
    const option = makeOptionRow(tokens, { label: 'West', selected: true, onToggle: optionToggle });
    expect(option.getAttribute('role')).toBe('option');
    expect(option.getAttribute('aria-selected')).toBe('true');
    option.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(option.style.background).toContain('rgba');
    option.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    expect(option.style.background).toContain('rgba');
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(optionToggle).toHaveBeenCalledTimes(1);

    const checkboxToggle = vi.fn();
    const check = makeOptionRow(tokens, {
      label: 'East',
      selected: false,
      checkbox: true,
      onToggle: checkboxToggle,
    });
    const input = check.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(check.tagName).toBe('LABEL');
    expect(input.checked).toBe(false);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(checkboxToggle).toHaveBeenCalledTimes(1);
  });

  it('makeDualSlider paints, steps, clamps, and supports programmatic set', () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const slider = makeDualSlider(tokens, {
      min: 0,
      max: 10,
      step: 2,
      low: -5,
      high: 15,
      format: (v) => `${v}u`,
      onInput,
      onChange,
    });
    const thumbs = slider.el.querySelectorAll('[role="slider"]');
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe('0');
    expect(thumbs[1].getAttribute('aria-valuenow')).toBe('10');
    expect(slider.el.textContent).toContain('0u');
    expect(slider.el.textContent).toContain('10u');

    thumbs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(onInput).toHaveBeenLastCalledWith(2, 10);
    expect(onChange).toHaveBeenLastCalledWith(2, 10);
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe('2');

    slider.set(8, 4);
    expect(thumbs[0].getAttribute('aria-valuenow')).toBe('8');
    expect(thumbs[1].getAttribute('aria-valuenow')).toBe('8');
  });

  it('withAlpha handles short, long, and non-hex colors', () => {
    expect(withAlpha('#0f8', 0.5)).toBe('rgba(0, 255, 136, 0.5)');
    expect(withAlpha('#102030', 0.25)).toBe('rgba(16, 32, 48, 0.25)');
    expect(withAlpha('currentColor', 0.5)).toBe('currentColor');
  });
});
