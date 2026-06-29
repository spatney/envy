import type { ReactNode } from 'react';
import type { ChartSpec, DashboardSpec } from 'graphein';

export type AnySpec = ChartSpec | DashboardSpec;

/** Result of a chapter's "your turn" check: did it pass, and if not, why. */
export interface CheckResult {
  pass: boolean;
  hints: string[];
}

export type CheckFn = (spec: AnySpec) => CheckResult;

export interface Chapter {
  /** URL slug: /learn/:id */
  id: string;
  /** Track section, e.g. "Basics". */
  group: string;
  /** Short title, e.g. "The one rule". */
  title: string;
  /** One-line description for nav + overview cards. */
  summary: string;
  /** Rich teaching content for the left column. */
  concept: ReactNode;
  /** The "your turn" instruction shown above the editor. */
  goal: ReactNode;
  /** Initial editable spec (stringified into the editor). */
  starter: AnySpec;
  /** A known-good answer revealed on demand. */
  solution: AnySpec;
  /** Structural assertions run against the user's edited spec. */
  check: CheckFn;
  /** Optional preview height. */
  height?: number;
}

export interface ChapterGroup {
  title: string;
  chapters: Chapter[];
}
