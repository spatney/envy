import { describe, expect, it } from 'vitest';
import { animate, prefersReducedMotion } from './index';

type RafCallback = (t: number) => void;

function createManualRaf() {
  const queue: RafCallback[] = [];
  return {
    queue,
    raf(cb: RafCallback): number {
      queue.push(cb);
      return queue.length;
    },
    cancelRaf(handle: number): void {
      queue[handle - 1] = () => undefined;
    },
    flush(time: number): void {
      const cb = queue.shift();
      cb?.(time);
    },
  };
}

describe('animate', () => {
  it('steps to final update and completes once', () => {
    let clock = 0;
    const manual = createManualRaf();
    const updates: number[] = [];
    let completions = 0;

    animate({
      duration: 100,
      now: () => clock,
      raf: manual.raf,
      cancelRaf: manual.cancelRaf,
      onUpdate: (t) => updates.push(t),
      onComplete: () => {
        completions += 1;
      },
    });

    clock = 50;
    manual.flush(clock);
    clock = 100;
    manual.flush(clock);
    manual.flush(clock);

    expect(updates).toEqual([0.5, 1]);
    expect(completions).toBe(1);
  });

  it('cancels before completion and prevents further callbacks', () => {
    let clock = 0;
    const manual = createManualRaf();
    const updates: number[] = [];
    let completions = 0;

    const animation = animate({
      duration: 100,
      now: () => clock,
      raf: manual.raf,
      cancelRaf: manual.cancelRaf,
      onUpdate: (t) => updates.push(t),
      onComplete: () => {
        completions += 1;
      },
    });

    clock = 25;
    manual.flush(clock);
    animation.cancel();
    clock = 100;
    manual.flush(clock);

    expect(updates).toEqual([0.25]);
    expect(completions).toBe(0);
  });

  it('completes synchronously for non-positive durations', () => {
    const manual = createManualRaf();
    const updates: number[] = [];
    let completions = 0;

    animate({
      duration: 0,
      raf: manual.raf,
      onUpdate: (t) => updates.push(t),
      onComplete: () => {
        completions += 1;
      },
    });

    expect(updates).toEqual([1]);
    expect(completions).toBe(1);
    expect(manual.queue).toHaveLength(0);
  });
});

describe('prefersReducedMotion', () => {
  it('returns false when matchMedia is undefined', () => {
    const original = globalThis.matchMedia;

    try {
      Object.defineProperty(globalThis, 'matchMedia', {
        configurable: true,
        value: undefined,
      });

      expect(prefersReducedMotion()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'matchMedia', {
        configurable: true,
        value: original,
      });
    }
  });
});
