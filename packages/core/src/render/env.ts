/** Environment helpers — safe in both browser and Node (SSR/test). */

export const isBrowser =
  typeof window !== 'undefined' && typeof document !== 'undefined';

/** Current device pixel ratio (defaults to 1 outside the browser). */
export function getDevicePixelRatio(): number {
  const dpr = (globalThis as { devicePixelRatio?: number }).devicePixelRatio;
  return typeof dpr === 'number' && dpr > 0 ? dpr : 1;
}
