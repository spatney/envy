import { allStories, storyGroups } from './stories/registry';

export interface NavLink {
  label: string;
  to: string;
  badge?: string;
}

export type NavSection =
  | { id: string; title: string; kind?: 'links'; items: NavLink[] }
  | { id: string; title: string; kind: 'charts' };

export const NAV: NavSection[] = [
  {
    id: 'start',
    title: 'Get started',
    items: [
      { label: 'Overview', to: '/' },
      { label: 'Foundations', to: '/foundations' },
      { label: 'Playground', to: '/playground' },
    ],
  },
  { id: 'charts', title: 'Charts', kind: 'charts' },
  {
    id: 'capabilities',
    title: 'Capabilities',
    items: [
      { label: 'Formatting & styling', to: '/formatting' },
      { label: 'Interactivity', to: '/interactivity' },
    ],
  },
  {
    id: 'agents',
    title: 'Server & agents',
    items: [
      { label: 'Server-side rendering', to: '/ssr', badge: 'live' },
      { label: 'MCP server', to: '/mcp', badge: 'live' },
    ],
  },
  {
    id: 'packages',
    title: 'Packages',
    items: [
      { label: 'The packages', to: '/packages' },
      { label: 'Using React', to: '/react' },
    ],
  },
];

export interface SearchEntry {
  label: string;
  to: string;
  group: string;
  keywords: string;
}

/** A flat, searchable index of every navigable destination (for ⌘K). */
export function searchIndex(): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const section of NAV) {
    if (section.kind === 'charts') continue;
    for (const item of section.items) {
      out.push({ label: item.label, to: item.to, group: section.title, keywords: item.label });
    }
  }
  for (const g of storyGroups()) {
    for (const s of g.stories) {
      out.push({
        label: s.title,
        to: `/charts/${s.id}`,
        group: g.title,
        keywords: `${s.title} ${s.group} ${(s.tags ?? []).join(' ')}`,
      });
    }
  }
  return out;
}

export function chartGroups() {
  return storyGroups();
}

export { allStories };
