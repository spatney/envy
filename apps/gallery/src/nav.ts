import { allStories, storyGroups } from './stories/registry';
import { learnChapters } from './learn/registry';
import { guides } from './guides/registry';

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
      { label: 'Learn Track', to: '/learn' },
      { label: 'Playground', to: '/playground' },
      { label: 'Dashboard Playground', to: '/playground/dashboard' },
    ],
  },
  { id: 'charts', title: 'Chart Catalog', kind: 'charts' },
  {
    id: 'guides',
    title: 'Guides',
    items: guides.map((g) => ({ label: g.title, to: `/guides/${g.id}` })),
  },
  {
    id: 'tools',
    title: 'Live Tools',
    items: [
      { label: 'Server Rendering', to: '/ssr', badge: 'live' },
      { label: 'MCP Console', to: '/mcp', badge: 'live' },
    ],
  },
  {
    id: 'reference',
    title: 'Reference',
    items: [
      { label: 'Packages', to: '/packages' },
      { label: 'React', to: '/react' },
      { label: 'Spec Reference', to: '/reference' },
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
  for (const ch of learnChapters) {
    out.push({ label: ch.title, to: `/learn/${ch.id}`, group: 'Learn', keywords: `${ch.title} ${ch.group} ${ch.summary}` });
  }
  for (const g of guides) {
    out.push({ label: g.title, to: `/guides/${g.id}`, group: 'Guides', keywords: `${g.title} ${g.summary}` });
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
