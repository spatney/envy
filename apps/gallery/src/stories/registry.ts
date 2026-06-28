import { chartStories } from './charts';
import type { Story, StoryGroup } from './types';

/** Every chart story, in declaration order. */
export const allStories: Story[] = [...chartStories];

export function storyById(id: string): Story | undefined {
  return allStories.find((s) => s.id === id);
}

/** Chart stories grouped by family, preserving first-seen order. */
export function storyGroups(): StoryGroup[] {
  const groups: StoryGroup[] = [];
  const index = new Map<string, StoryGroup>();
  for (const story of allStories) {
    let g = index.get(story.group);
    if (!g) {
      g = { id: story.group, title: story.group, stories: [] };
      index.set(story.group, g);
      groups.push(g);
    }
    g.stories.push(story);
  }
  return groups;
}
