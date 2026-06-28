/** Hand a spec from any page to the Playground via sessionStorage + navigation. */
import type { ChartSpec, DashboardSpec } from 'graphein';
import { fullSpecJson } from './chart';

const KEY = 'graphein.playground.handoff';

export function stashForPlayground(spec: ChartSpec | DashboardSpec): void {
  try {
    sessionStorage.setItem(KEY, fullSpecJson(spec));
  } catch {
    /* ignore */
  }
}

export function takePlaygroundHandoff(): string | null {
  try {
    const v = sessionStorage.getItem(KEY);
    if (v) sessionStorage.removeItem(KEY);
    return v;
  } catch {
    return null;
  }
}
