export function interpolateNumber(a: number, b: number): (t: number) => number {
  const delta = b - a;
  return (t: number) => {
    if (t === 0) {
      return a;
    }
    if (t === 1) {
      return b;
    }
    return a + delta * t;
  };
}

export function interpolateArray(a: number[], b: number[]): (t: number) => number[] {
  const interpolators = a.map((value, index) => interpolateNumber(value, b[index] ?? value));
  return (t: number) => interpolators.map((interpolate) => interpolate(t));
}

export function interpolateObject<T extends Record<string, number>>(a: T, b: T): (t: number) => T {
  const keys = Object.keys(a) as (keyof T)[];
  const interpolators = keys.map((key) => [key, interpolateNumber(a[key], b[key])] as const);

  return (t: number) => {
    const out = {} as T;
    for (const [key, interpolate] of interpolators) {
      out[key] = interpolate(t) as T[typeof key];
    }
    return out;
  };
}

export function interpolateNumberArray(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
): (t: number) => number[] {
  const length = a.length;
  const interpolators = Array.from({ length }, (_, index) => interpolateNumber(a[index], b[index] ?? a[index]));
  return (t: number) => interpolators.map((interpolate) => interpolate(t));
}
