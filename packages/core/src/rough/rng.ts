/**
 * Deterministic randomness for the hand-drawn ("sketch") renderer.
 *
 * Every wobble in a sketched chart comes from this PRNG, seeded from the spec so
 * a given chart renders pixel-identically on every paint — a hard requirement
 * for the screenshot harness (which waits on a stable `data-envy-ready`).
 */

/** A seeded pseudo-random source returning floats in [0, 1). */
export type Rng = () => number;

/**
 * mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Same seed ⇒ same
 * stream, which is exactly what deterministic sketching needs.
 */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a string hash → 32-bit unsigned int. Used to derive a stable seed from a
 * spec's identity (type/title/data size) when the author doesn't pass one.
 */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
