export type EasingFunction = (t: number) => number;

const overshoot = 1.70158;

function endpoint(t: number): 0 | 1 | undefined {
  if (t === 0) {
    return 0;
  }
  if (t === 1) {
    return 1;
  }
  return undefined;
}

export function linear(t: number): number {
  return t;
}

export function quadIn(t: number): number {
  return t * t;
}

export function quadOut(t: number): number {
  return t * (2 - t);
}

export function quadInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function cubicIn(t: number): number {
  return t * t * t;
}

export function cubicOut(t: number): number {
  const u = t - 1;
  return u * u * u + 1;
}

export function cubicInOut(t: number): number {
  const u = 2 * t - 2;
  return t < 0.5 ? 4 * t * t * t : 0.5 * u * u * u + 1;
}

export function expoOut(t: number): number {
  const end = endpoint(t);
  return end ?? 1 - 2 ** (-10 * t);
}

export function expoInOut(t: number): number {
  const end = endpoint(t);
  if (end !== undefined) {
    return end;
  }
  return t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2;
}

export function sinInOut(t: number): number {
  const end = endpoint(t);
  return end ?? -(Math.cos(Math.PI * t) - 1) / 2;
}

export function backOut(t: number): number {
  const end = endpoint(t);
  if (end !== undefined) {
    return end;
  }
  const u = t - 1;
  return 1 + (overshoot + 1) * u * u * u + overshoot * u * u;
}

export function bounceOut(t: number): number {
  const end = endpoint(t);
  if (end !== undefined) {
    return end;
  }

  const n1 = 7.5625;
  const d1 = 2.75;

  if (t < 1 / d1) {
    return n1 * t * t;
  }
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }

  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
}

export function elasticOut(t: number): number {
  const end = endpoint(t);
  if (end !== undefined) {
    return end;
  }

  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export const easings: Record<string, EasingFunction> = {
  linear,
  quadIn,
  quadOut,
  quadInOut,
  cubicIn,
  cubicOut,
  cubicInOut,
  expoOut,
  expoInOut,
  sinInOut,
  backOut,
  bounceOut,
  elasticOut,
};
