/**
 * Dashboard spec — the single-JSON, agent-facing layer that composes several
 * charts and slicers into one cross-interacting page.
 *
 * A dashboard owns a shared dataset and a shared selection store, lays its views
 * out on a responsive grid, and *auto-wires* cross-interaction: slicers filter
 * the charts, and clicking a chart cross-filters the other views while the
 * source dims its own unpicked marks (Power BI–style).
 * Everything is plain JSON — no callbacks — so a dashboard
 * round-trips through `JSON.stringify` just like a chart.
 */

import type { Datum } from '../types';
import type { ThemeInput } from '../theme';
import type { ChartSpec, Dimensions, TitleConfig } from './types';
import type { SelectionParam } from './selection';

export interface DashboardResponsiveSpan {
  /** Dashboard/section width threshold in px. Smallest matching maxWidth wins. */
  maxWidth: number;
  /** Override column span at this width. */
  w?: number;
  /** Override row span at this width. */
  h?: number;
  /** Hide the view at this width. */
  hidden?: boolean;
}

/** One placed view in a dashboard: a chart or slicer spec plus grid placement. */
export interface DashboardView {
  /** Unique id within the dashboard (used for layout + link references). */
  id: string;
  /** The chart or slicer to render. Inherits the dashboard's `data` when omitted. */
  spec: ChartSpec;
  /** Grid column start (1-based). Omit for auto-flow placement. */
  x?: number;
  /** Grid row start (1-based). Omit for auto-flow placement. */
  y?: number;
  /** Column span (in grid columns). Defaults by view type. */
  w?: number;
  /** Row span (in grid rows). Defaults by view type. */
  h?: number;
  /** Optional card title drawn by the dashboard chrome. */
  title?: string;
  /** Optional card subtitle drawn below the dashboard card title. */
  subtitle?: string;
  /** Whether to draw the card frame. Defaults to true. */
  frame?: boolean;
  /** Card background override. */
  background?: string;
  /** Solid accent bar color for the card. */
  accent?: string;
  /** Card content padding. Defaults to 'standard'. */
  padding?: 'none' | 'standard';
  /** Per-view responsive span overrides; smallest matching maxWidth wins. */
  responsive?: DashboardResponsiveSpan[];
}

/** Explicit cross-interaction from one view to others (overrides auto-wiring). */
export interface InteractionLink {
  /** Source view id (the visual whose selection drives the interaction). */
  source: string;
  /** Target view id(s), or '*' for every other view. */
  target: string | string[] | '*';
  /** How targets react. Default: 'filter' for slicers, 'highlight' for charts. */
  as?: 'highlight' | 'filter' | 'none';
  /** Identity fields to match on. Defaults to the source's key field(s). */
  fields?: string[];
}

export interface DashboardLayout {
  /** Number of grid columns at full width (default 12). */
  cols?: number;
  /** Height of one grid row in px (default 96). */
  rowHeight?: number;
  /** Gap between cells in px (default 14). */
  gap?: number;
  /**
   * Responsive column counts. When the dashboard is narrower than a breakpoint's
   * `maxWidth`, the grid switches to that breakpoint's `cols` and tiles reflow
   * (DataZen-style). The smallest matching breakpoint wins. Defaults to
   * `[{ maxWidth: 600, cols: 1 }, { maxWidth: 960, cols: 6 }]`.
   */
  breakpoints?: { maxWidth: number; cols: number }[];
  /**
   * Where unplaced slicers are laid out:
   * - 'top' (default): compact slicers (dropdown/search/range/dateRange) form a
   *   navigator strip above the grid, like a BI filter bar.
   * - 'inline': every slicer is laid out in the grid like a chart.
   */
  navigators?: 'top' | 'inline';
  /** Optional section bands; unlisted views render in an implicit trailing section. */
  sections?: DashboardSection[];
  /** Placement preset for unplaced views. Defaults to 'auto'. */
  preset?: 'auto' | 'kpi-first' | 'sidebar';
  /** Constrain and center the dashboard page. */
  maxWidth?: number;
  /** Spacing preset applied before explicit gap/rowHeight overrides. */
  density?: 'compact' | 'standard' | 'comfortable';
  /** Page padding in px. Defaults to a value derived from gap. */
  padding?: number;
}

export interface DashboardSection {
  /** Optional stable id for the section band. */
  id?: string;
  /** Section title shown above the grid. */
  title?: string;
  /** Muted line shown under the section title. */
  subtitle?: string;
  /** View ids included in this section. */
  views: string[];
  /** Section-specific column count override. */
  cols?: number;
  /** Section-specific row height override. */
  rowHeight?: number;
  /** Header band background tint. */
  background?: string;
  /** Initial collapsed state; click the header to expand/collapse. */
  collapsed?: boolean;
}

export interface DashboardSpec {
  type: 'dashboard';
  /** Shared dataset; views without their own `data` inherit this. */
  data?: Datum[];
  theme?: ThemeInput;
  title?: string | TitleConfig;
  /** Optional muted subtitle shown under the title in the dashboard header. */
  subtitle?: string;
  background?: string;
  dimensions?: Dimensions;
  /** Dashboard-level named selections (e.g. seeded initial values). */
  params?: SelectionParam[];
  layout?: DashboardLayout;
  /** The placed views. */
  views: DashboardView[];
  /**
   * Cross-interaction policy:
   * - 'auto' (default): every source cross-filters the page — slicers and chart
   *   clicks both subset rows in the other views; the clicked chart dims its own
   *   unpicked marks instead of hiding them.
   * - 'none': views are laid out but not linked.
   * - an array of {@link InteractionLink}: explicit wiring (replaces auto).
   */
  interactions?: 'auto' | 'none' | InteractionLink[];
}

/**
 * Any top-level Graphein spec: a chart, a slicer, or a dashboard. This is the
 * root type the JSON Schema (`docs/chart-spec.schema.json`) is generated from,
 * and the broadest type `validateSpec` accepts.
 */
export type AnySpec = ChartSpec | DashboardSpec;
