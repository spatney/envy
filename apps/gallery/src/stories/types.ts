import type { ChartSpec } from 'graphein';
import type { ReactNode } from 'react';

export type StoryArgs = Record<string, string | number | boolean>;

interface ControlBase {
  id: string;
  label: string;
}
export type StoryControl =
  | (ControlBase & { kind: 'toggle'; default: boolean })
  | (ControlBase & {
      kind: 'select';
      options: { value: string; label?: string }[];
      default: string;
    })
  | (ControlBase & { kind: 'range'; min: number; max: number; step?: number; default: number });

export interface Story {
  /** Unique id — used in the URL (`/charts/:id`) and the shot registry. */
  id: string;
  /** Chart family / sidebar group. */
  group: string;
  title: string;
  blurb?: string;
  tags?: string[];
  /** Suggest a wider stage by default (flows, maps, tables). */
  wide?: boolean;
  /** Default stage height in CSS px. */
  height?: number;
  /** Build the spec — optionally parameterised by control args. */
  spec(args?: StoryArgs): ChartSpec;
  /** Interactive knobs (storybook-style controls). */
  controls?: StoryControl[];
  /** Optional rich docs rendered in the Docs tab. */
  docs?: ReactNode;
  /** Optional hand-authored React usage snippet (defaults to a generated one). */
  reactCode?: string;
}

export interface StoryGroup {
  id: string;
  title: string;
  stories: Story[];
}

/** Initial control args from a story's control defaults. */
export function defaultArgs(story: Story): StoryArgs {
  const args: StoryArgs = {};
  for (const c of story.controls ?? []) args[c.id] = c.default;
  return args;
}
