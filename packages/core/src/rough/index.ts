/**
 * graphein rough engine — a tiny, dependency-free hand-drawn renderer used by
 * the "sketch" chart style. Public surface: the `RoughPen`, its factory, the
 * style/options types, and the PRNG helpers used to derive deterministic seeds.
 */

export { RoughPen, createRoughPen, type RoughContext } from './draw';
export {
  DEFAULT_ROUGH_STYLE,
  type RoughStyle,
  type MarkOptions,
  type FillStyle,
} from './types';
export { mulberry32, hashString, type Rng } from './rng';
export { polygonHachureLines, sampleArc, rotatePoint, type HachureSegment } from './geom';
