import type { ChartSpec, DashboardSpec } from 'graphein';
import { dashboardDemo } from '../content/interactive';
import { allStories } from '../stories/registry';
import { defaultArgs } from '../stories/types';

export interface ShotEntry {
  id: string;
  kind: 'chart' | 'dashboard';
  spec: ChartSpec | DashboardSpec;
}

/** Deterministic specs addressable by `?shot=<id>` for the visual-test harness. */
export function buildShotRegistry(): Map<string, ShotEntry> {
  const map = new Map<string, ShotEntry>();
  for (const story of allStories) {
    map.set(story.id, { id: story.id, kind: 'chart', spec: story.spec(defaultArgs(story)) });
  }
  map.set('dashboard-cockpit', { id: 'dashboard-cockpit', kind: 'dashboard', spec: dashboardDemo() });
  return map;
}

export function shotSpec(id: string): ShotEntry | undefined {
  return buildShotRegistry().get(id);
}
