/**
 * Layout engine.
 *
 * Given the surface size, theme typography, and what the chart needs to show
 * (title, legend, axis tick labels), `computeFrame` reserves space for each
 * region and returns the plot rectangle where marks are drawn. It is pure (text
 * widths come from an injected measurer) so it unit-tests in node.
 */

import type { Insets, Rect } from '../types';
import type { LegendPosition } from '../spec/types';
import type { ThemeFont } from '../theme';
import { measureText, fontString } from '../render/text';

export interface LegendItem {
  label: string;
  color: string;
  /** Marker style; defaults to a filled swatch. */
  symbol?: 'square' | 'line' | 'circle';
}

export interface PositionedLegendItem extends LegendItem {
  x: number;
  y: number;
  /** Total item width (swatch + gap + label). */
  width: number;
}

export interface TitleInput {
  text?: string;
  subtitle?: string;
  align?: 'left' | 'center' | 'right';
}

export interface AxisInput {
  show: boolean;
  /** Formatted tick labels used to measure the gutter. */
  labels: string[];
  title?: string;
  /**
   * True when the first/last ticks sit exactly on the plot's horizontal edges
   * (linear/time scales), so half of each edge label overflows the plot and the
   * layout must reserve room for it. Band scales inset their labels, so this is
   * false/omitted for them.
   */
  edgeAnchored?: boolean;
}

export interface FrameInput {
  width: number;
  height: number;
  padding: Insets;
  font: ThemeFont;
  /** Optional origin offset — lay the frame out within a sub-region (e.g. a facet cell). */
  originX?: number;
  originY?: number;
  title?: TitleInput;
  legend?: { items: LegendItem[]; position: LegendPosition };
  /** Cartesian charts pass both axes; non-cartesian omit them. */
  xAxis?: AxisInput;
  yAxis?: AxisInput;
  /** Secondary (right) y-axis for dual-axis combo charts; reserves a right gutter. */
  y2Axis?: AxisInput;
}

export interface Frame {
  width: number;
  height: number;
  /** Absolute origin offset of this frame within the surface (0 unless faceted). */
  originX: number;
  originY: number;
  plot: Rect;
  titleRect?: Rect;
  subtitleRect?: Rect;
  legendRect?: Rect;
  legendItems?: PositionedLegendItem[];
  legendPosition?: LegendPosition;
}

export const TICK_SIZE = 6;
const AXIS_LABEL_GAP = 6;
const AXIS_TITLE_GAP = 4;
const LEGEND_SWATCH = 11;
const LEGEND_SWATCH_GAP = 6;
const LEGEND_ITEM_GAP = 16;
const LEGEND_ROW_GAP = 6;
const LEGEND_PAD = 4;

const lineHeight = (size: number): number => Math.round(size * 1.35);

function legendItemWidth(label: string, font: ThemeFont): number {
  const w = measureText(label, fontString(font.size.small, font.family, font.weight.normal)).width;
  return LEGEND_SWATCH + LEGEND_SWATCH_GAP + Math.ceil(w);
}

interface LegendBlock {
  width: number;
  height: number;
  items: PositionedLegendItem[];
}

/** Lay out legend items within a max width/height, returning size + positions. */
function layoutLegend(
  items: LegendItem[],
  position: LegendPosition,
  font: ThemeFont,
  maxWidth: number,
  maxHeight: number,
): LegendBlock {
  const rowH = Math.max(LEGEND_SWATCH, lineHeight(font.size.small));
  const horizontal = position === 'top' || position === 'bottom';

  if (horizontal) {
    const rows: PositionedLegendItem[][] = [[]];
    let x = 0;
    let row = 0;
    for (const item of items) {
      const w = legendItemWidth(item.label, font);
      if (x > 0 && x + w > maxWidth) {
        row++;
        rows[row] = [];
        x = 0;
      }
      rows[row].push({ ...item, x, y: row * (rowH + LEGEND_ROW_GAP), width: w });
      x += w + LEGEND_ITEM_GAP;
    }
    const widest = Math.max(
      0,
      ...rows.map((r) => r.reduce((acc, it) => acc + it.width + LEGEND_ITEM_GAP, -LEGEND_ITEM_GAP)),
    );
    const height = rows.length * rowH + (rows.length - 1) * LEGEND_ROW_GAP;
    // Center each row horizontally within the block.
    const blockWidth = Math.min(maxWidth, widest);
    const positioned: PositionedLegendItem[] = [];
    for (const r of rows) {
      const rowWidth = r.reduce((acc, it) => acc + it.width + LEGEND_ITEM_GAP, -LEGEND_ITEM_GAP);
      const offset = Math.max(0, (blockWidth - rowWidth) / 2);
      for (const it of r) positioned.push({ ...it, x: it.x + offset });
    }
    return { width: blockWidth, height: height + LEGEND_PAD * 2, items: positioned };
  }

  // Vertical (left/right): stack, truncate to maxHeight.
  const maxRows = Math.max(1, Math.floor((maxHeight + LEGEND_ROW_GAP) / (rowH + LEGEND_ROW_GAP)));
  const shown = items.slice(0, maxRows);
  const width = Math.max(0, ...shown.map((it) => legendItemWidth(it.label, font)));
  const positioned = shown.map((it, i) => ({
    ...it,
    x: 0,
    y: i * (rowH + LEGEND_ROW_GAP),
    width: legendItemWidth(it.label, font),
  }));
  const height = shown.length * rowH + (shown.length - 1) * LEGEND_ROW_GAP;
  return { width: width + LEGEND_PAD * 2, height, items: positioned };
}

/** Reserve space for every region and return the plot rect + positioned chrome. */
export function computeFrame(input: FrameInput): Frame {
  const { width, height, padding, font } = input;
  const ox = input.originX ?? 0;
  const oy = input.originY ?? 0;
  let top = oy + padding.top;
  let right = ox + width - padding.right;
  let bottom = oy + height - padding.bottom;
  let left = ox + padding.left;

  const frame: Frame = {
    width,
    height,
    originX: ox,
    originY: oy,
    plot: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
  };

  // --- Title (top band) ---
  if (input.title?.text) {
    const titleH = lineHeight(font.size.title);
    frame.titleRect = { x: left, y: top, width: right - left, height: titleH };
    top += titleH;
    if (input.title.subtitle) {
      const subH = lineHeight(font.size.small);
      frame.subtitleRect = { x: left, y: top, width: right - left, height: subH };
      top += subH;
    }
    top += font.size.base; // breathing room before the plot
  }

  // --- Legend (one side) ---
  if (input.legend && input.legend.items.length > 0) {
    const pos = input.legend.position;
    const availW = right - left;
    const availH = bottom - top;
    const block = layoutLegend(input.legend.items, pos, font, availW, availH);
    frame.legendPosition = pos;
    if (pos === 'top') {
      frame.legendRect = { x: left, y: top, width: availW, height: block.height };
      top += block.height + font.size.base;
    } else if (pos === 'bottom') {
      frame.legendRect = { x: left, y: bottom - block.height, width: availW, height: block.height };
      bottom -= block.height + font.size.base;
    } else if (pos === 'left') {
      frame.legendRect = { x: left, y: top, width: block.width, height: availH };
      left += block.width + font.size.base;
    } else {
      frame.legendRect = { x: right - block.width, y: top, width: block.width, height: availH };
      right -= block.width + font.size.base;
    }
    // Offset positioned items into absolute frame coordinates.
    const ox = frame.legendRect.x + LEGEND_PAD;
    const oy = frame.legendRect.y + LEGEND_PAD;
    frame.legendItems = block.items.map((it) => ({ ...it, x: it.x + ox, y: it.y + oy }));
  }

  // --- Axes (cartesian) ---
  if (input.yAxis?.show) {
    let gutter = 0;
    if (input.yAxis.labels.length) {
      const wfont = fontString(font.size.small, font.family, font.weight.normal);
      const widest = Math.max(...input.yAxis.labels.map((l) => measureText(l, wfont).width));
      gutter = Math.ceil(widest) + TICK_SIZE + AXIS_LABEL_GAP;
    }
    if (input.yAxis.title) gutter += lineHeight(font.size.base) + AXIS_TITLE_GAP;
    left += gutter;
    // Reserve half a label line so the top/bottom tick labels (which center on
    // the plot edges) never collide with the legend above or x labels below.
    const yHalf = Math.ceil(lineHeight(font.size.small) / 2);
    top += yHalf;
    bottom -= yHalf;
  }
  // Secondary (right) y-axis — mirror of the left gutter on the right edge.
  if (input.y2Axis?.show) {
    let gutter = 0;
    if (input.y2Axis.labels.length) {
      const wfont = fontString(font.size.small, font.family, font.weight.normal);
      const widest = Math.max(...input.y2Axis.labels.map((l) => measureText(l, wfont).width));
      gutter = Math.ceil(widest) + TICK_SIZE + AXIS_LABEL_GAP;
    }
    if (input.y2Axis.title) gutter += lineHeight(font.size.base) + AXIS_TITLE_GAP;
    right -= gutter;
    if (!input.yAxis?.show) {
      const yHalf = Math.ceil(lineHeight(font.size.small) / 2);
      top += yHalf;
      bottom -= yHalf;
    }
  }
  if (input.xAxis?.show) {
    let gutter = lineHeight(font.size.small) + TICK_SIZE + AXIS_LABEL_GAP;
    if (input.xAxis.title) gutter += lineHeight(font.size.base) + AXIS_TITLE_GAP;
    bottom -= gutter;
    // Edge-anchored x labels (linear/time) center on the first/last ticks, which
    // sit on the plot's left/right edges — reserve half of each so they don't
    // overflow (and get clipped) at narrow widths.
    if (input.xAxis.edgeAnchored && input.xAxis.labels.length) {
      const wfont = fontString(font.size.small, font.family, font.weight.normal);
      const labels = input.xAxis.labels;
      const firstHalf = Math.ceil(measureText(labels[0], wfont).width / 2);
      const lastHalf = Math.ceil(measureText(labels[labels.length - 1], wfont).width / 2);
      left = Math.max(left, ox + padding.left + firstHalf);
      right -= lastHalf;
    }
  }

  frame.plot = {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
  return frame;
}
