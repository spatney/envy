const SQRT_2 = Math.sqrt(2);
const SQRT_10 = Math.sqrt(10);
const SQRT_50 = Math.sqrt(50);

function normalizeCount(count: number): number {
  return Math.max(0, Math.floor(count));
}

function decimalPlaces(step: number): number {
  if (!Number.isFinite(step) || step === 0) {
    return 0;
  }

  const exponent = Math.floor(Math.log10(Math.abs(step)));
  return Math.max(0, -exponent + 1);
}

function roundToStep(value: number, step: number): number {
  const places = decimalPlaces(step);
  const rounded = Number(value.toFixed(Math.min(places, 15)));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function tickStep(start: number, stop: number, count: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start === stop) {
    return 0;
  }

  const desiredCount = normalizeCount(count);
  if (desiredCount === 0) {
    return stop > start ? Infinity : -Infinity;
  }

  const reverse = stop < start;
  const span = Math.abs(stop - start);
  const rawStep = span / desiredCount;
  const power = Math.floor(Math.log10(rawStep));
  const base = 10 ** power;
  const error = rawStep / base;
  const factor = error >= SQRT_50 ? 10 : error >= SQRT_10 ? 5 : error >= SQRT_2 ? 2 : 1;
  const step = factor === 10 ? 10 ** (power + 1) : factor * base;
  return reverse ? -step : step;
}

export function tickIncrement(start: number, stop: number, count: number): number {
  return tickStep(start, stop, count);
}

export function niceDomain(start: number, stop: number, count: number): [number, number] {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || start === stop) {
    return [start, stop];
  }

  const reverse = stop < start;
  const min = reverse ? stop : start;
  const max = reverse ? start : stop;
  const step = Math.abs(tickStep(min, max, count));

  if (!Number.isFinite(step) || step === 0) {
    return [start, stop];
  }

  const niceMin = roundToStep(Math.floor(min / step) * step, step);
  const niceMax = roundToStep(Math.ceil(max / step) * step, step);
  return reverse ? [niceMax, niceMin] : [niceMin, niceMax];
}

export function ticks(start: number, stop: number, count: number): number[] {
  if (!Number.isFinite(start) || !Number.isFinite(stop)) {
    return [];
  }

  if (start === stop) {
    return [start];
  }

  const reverse = stop < start;
  const [niceStart, niceStop] = niceDomain(start, stop, count);
  const min = reverse ? niceStop : niceStart;
  const max = reverse ? niceStart : niceStop;
  const step = Math.abs(tickStep(min, max, count));

  if (!Number.isFinite(step) || step === 0) {
    return [start, stop];
  }

  const first = Math.round(min / step);
  const last = Math.round(max / step);
  const result: number[] = [];

  for (let index = first; index <= last; index += 1) {
    result.push(roundToStep(index * step, step));
  }

  return reverse ? result.reverse() : result;
}
