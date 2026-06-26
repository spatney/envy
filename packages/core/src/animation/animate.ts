import { linear } from './easing';

export interface AnimateOptions {
  duration: number;
  easing?: (t: number) => number;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
  now?: () => number;
  raf?: (cb: (t: number) => void) => number;
  cancelRaf?: (handle: number) => void;
}

export interface AnimationHandle {
  cancel(): void;
}

function defaultNow(): number {
  return globalThis.performance?.now() ?? Date.now();
}

function defaultRaf(cb: (t: number) => void): number {
  if (globalThis.requestAnimationFrame !== undefined) {
    return globalThis.requestAnimationFrame(cb);
  }

  return globalThis.setTimeout(() => cb(defaultNow()), 16) as unknown as number;
}

function defaultCancelRaf(handle: number): void {
  if (globalThis.cancelAnimationFrame !== undefined) {
    globalThis.cancelAnimationFrame(handle);
    return;
  }

  globalThis.clearTimeout(handle);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function animate(opts: AnimateOptions): AnimationHandle {
  const easing = opts.easing ?? linear;

  if (opts.duration <= 0) {
    opts.onUpdate(easing(1));
    opts.onComplete?.();
    return {
      cancel(): void {
        return;
      },
    };
  }

  const now = opts.now ?? defaultNow;
  const raf = opts.raf ?? defaultRaf;
  const cancelRaf = opts.cancelRaf ?? defaultCancelRaf;
  const start = now();
  let cancelled = false;
  let completed = false;
  let frame: number | undefined;

  const step = (): void => {
    if (cancelled || completed) {
      return;
    }

    const rawT = clamp01((now() - start) / opts.duration);
    opts.onUpdate(easing(rawT));

    if (rawT >= 1) {
      completed = true;
      opts.onComplete?.();
      return;
    }

    frame = raf(step);
  };

  frame = raf(step);

  return {
    cancel(): void {
      if (cancelled || completed) {
        return;
      }
      cancelled = true;
      if (frame !== undefined) {
        cancelRaf(frame);
      }
    },
  };
}
