// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveTheme } from '../theme';
import type { Surface } from '../render/surface';
import type { InteractionModel } from './types';
import { InteractionController } from './controller';

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
});

const makeSurface = () => {
  const root = document.createElement('div');
  Object.assign(root.style, { position: 'relative', width: '200px', height: '120px' });
  Object.defineProperty(root, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ left: 10, top: 20, width: 200, height: 120, right: 210, bottom: 140, x: 10, y: 20, toJSON: () => ({}) }),
  });
  document.body.appendChild(root);
  const ctx = {
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const surface = {
    root,
    width: 200,
    height: 120,
    interaction: { ctx },
  } as unknown as Surface;
  return { surface, root, ctx: ctx as CanvasRenderingContext2D & { clearRect: ReturnType<typeof vi.fn> } };
};

const pointer = (type: string, x: number, y: number): Event =>
  new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }) as unknown as PointerEvent;

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InteractionController', () => {
  it('hit-tests pointer moves, paints highlights, and shows a tooltip once per active key', () => {
    let raf: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf = cb;
      return 1;
    });
    const { surface, root, ctx } = makeSurface();
    const draw = vi.fn();
    const model: InteractionModel = {
      region: { x: 0, y: 0, width: 200, height: 120 },
      hitTest: vi.fn(() => ({
        key: 'A',
        anchorX: 50,
        anchorY: 40,
        content: { title: 'Point A', rows: [{ label: 'value', value: '10' }] },
        draw,
      })),
    };

    const ctl = new InteractionController(surface, resolveTheme());
    ctl.setModel(model, resolveTheme());
    root.dispatchEvent(pointer('pointermove', 60, 65));
    raf?.(1);

    expect(model.hitTest).toHaveBeenCalledWith(50, 45);
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 200, 120);
    expect(draw).toHaveBeenCalledWith(ctx);
    expect(root.querySelector('.graphein-tooltip')?.textContent).toContain('Point A');

    root.dispatchEvent(pointer('pointermove', 62, 66));
    raf?.(2);
    expect(draw).toHaveBeenCalledTimes(1);
    ctl.destroy();
  });

  it('clears hover on misses and pointer leave, including pending animation frames', () => {
    const cancel = vi.fn();
    let raf: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      raf = cb;
      return 7;
    });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { surface, root, ctx } = makeSurface();
    const hitTest = vi.fn().mockReturnValueOnce({
      key: 'A',
      anchorX: 20,
      anchorY: 20,
      content: { rows: [{ label: 'A', value: '1' }] },
    }).mockReturnValueOnce(null);

    const ctl = new InteractionController(surface, resolveTheme());
    ctl.setModel({ region: { x: 0, y: 0, width: 200, height: 120 }, hitTest }, resolveTheme());
    root.dispatchEvent(pointer('pointermove', 25, 25));
    raf?.(1);
    expect((root.querySelector('.graphein-tooltip') as HTMLElement).style.opacity).toBe('1');

    root.dispatchEvent(pointer('pointermove', 26, 26));
    raf?.(2);
    expect((root.querySelector('.graphein-tooltip') as HTMLElement).style.opacity).toBe('0');

    root.dispatchEvent(pointer('pointermove', 30, 30));
    root.dispatchEvent(new Event('pointerleave'));
    expect(cancel).toHaveBeenCalledWith(7);
    expect(ctx.clearRect).toHaveBeenCalled();
    ctl.destroy();
  });

  it('publishes clicks through pick, toggles cursor for pickable hover, and removes listeners on destroy', () => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(1);
      return 1;
    });
    const { surface, root } = makeSurface();
    const onPick = vi.fn();
    const hitTest = vi.fn(() => ({
      key: 'B',
      anchorX: 30,
      anchorY: 30,
      content: { rows: [{ label: 'B', value: '2' }] },
    }));
    const pick = vi.fn(() => ({ kind: 'point' as const, fields: ['category'], tuples: [['B']] }));
    const model: InteractionModel = { region: { x: 0, y: 0, width: 200, height: 120 }, hitTest, pick };

    const ctl = new InteractionController(surface, resolveTheme());
    ctl.setModel(model, resolveTheme());
    ctl.setSelect({ onPick });
    root.dispatchEvent(pointer('pointermove', 40, 50));
    expect(root.style.cursor).toBe('pointer');

    root.dispatchEvent(pointer('click', 45, 55));
    expect(pick).toHaveBeenCalledWith(35, 35);
    expect(onPick).toHaveBeenCalledWith({ kind: 'point', fields: ['category'], tuples: [['B']] });

    ctl.setModel(null, resolveTheme());
    expect((root.querySelector('.graphein-tooltip') as HTMLElement).style.opacity).toBe('0');
    ctl.destroy();
    root.dispatchEvent(pointer('click', 45, 55));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.graphein-tooltip')).toBeNull();
  });
});
