// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { resolveTheme } from '../theme';
import { Tooltip } from './tooltip';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const root = (): HTMLElement => {
  const el = document.createElement('div');
  Object.assign(el.style, { position: 'relative', width: '300px', height: '180px' });
  document.body.appendChild(el);
  return el;
};

describe('Tooltip', () => {
  it('renders structured title, rows, swatches, and escaped text content', () => {
    const r = root();
    const t = new Tooltip(r, resolveTheme());
    t.setContent({
      title: '<Revenue>',
      rows: [
        { label: 'West & East', value: '<42>', swatch: '#f00', strong: true },
        { label: 'Muted', value: '7', muted: true },
      ],
    });

    const card = r.querySelector('.graphein-tooltip') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.textContent).toContain('<Revenue>');
    expect(card.innerHTML).not.toContain('<Revenue></Revenue>');
    expect(card.querySelectorAll('.graphein-tooltip-row')).toHaveLength(2);
    expect((card.querySelector('.graphein-tooltip-swatch') as HTMLElement).style.background).toBe('rgb(255, 0, 0)');
    expect((card.querySelector('.graphein-tooltip-title') as HTMLElement).style.fontWeight).toBe(String(resolveTheme().font.weight.bold));
  });

  it('positions beside the anchor and flips away from right and bottom edges', () => {
    const r = root();
    const t = new Tooltip(r, resolveTheme());
    t.setContent({ rows: [{ label: 'A', value: '1' }] });
    const card = r.querySelector('.graphein-tooltip') as HTMLElement;
    Object.defineProperty(card, 'offsetWidth', { configurable: true, value: 90 });
    Object.defineProperty(card, 'offsetHeight', { configurable: true, value: 40 });

    t.place(40, 30, 300, 180);
    expect(card.style.opacity).toBe('1');
    expect(card.style.transform).toBe('translate(54px, 44px)');

    t.place(290, 170, 300, 180);
    expect(card.style.transform).toBe('translate(186px, 116px)');
  });

  it('hides, rethemes, and destroys its element', () => {
    const r = root();
    const t = new Tooltip(r, resolveTheme());
    t.setContent({ rows: [{ label: 'A', value: '1' }] });
    t.place(10, 10, 200, 100);
    t.hide();
    const card = r.querySelector('.graphein-tooltip') as HTMLElement;
    expect(card.style.opacity).toBe('0');
    expect(card.style.transform).toBe('translate(-9999px, -9999px)');

    t.setTokens(resolveTheme('dark'));
    expect(card.style.boxShadow).toContain('rgba(0,0,0');
    t.destroy();
    expect(r.querySelector('.graphein-tooltip')).toBeNull();
  });
});
