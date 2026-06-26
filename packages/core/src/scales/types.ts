export interface ContinuousScale {
  map(value: number): number;
  invert(pixel: number): number;
  ticks(count?: number): number[];
  tickFormat(count?: number): (v: number) => string;
  nice(count?: number): ContinuousScale;
  copy(): ContinuousScale;
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
}

export interface BandScale {
  map(value: string): number | undefined;
  readonly bandwidth: number;
  readonly step: number;
  readonly domain: readonly string[];
  readonly range: readonly [number, number];
}

export interface PointScale {
  map(value: string): number | undefined;
  readonly step: number;
  readonly domain: readonly string[];
  readonly range: readonly [number, number];
}
