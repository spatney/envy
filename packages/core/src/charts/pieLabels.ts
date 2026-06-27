/**
 * Pure layout engine for pie / donut slice labels.
 *
 * Decides, per slice, whether a label sits **inside** the wedge or becomes an
 * **outside callout** with a leader line, then lays the outside labels out into
 * two collision-free columns (left / right) and reserves horizontal room for
 * them by shrinking / recentring the pie. No DOM, no canvas — every output is a
 * plain number so the result is deterministic and unit-testable.
 *
 * Angle convention matches `pie.ts`: 0 rad points up (12 o'clock) and angles
 * increase clockwise, so a point at radius `r` and angle `a` is
 * `(cx + r·sin a, cy − r·cos a)`.
 */

export type PieLabelContent =
  | 'percent'
  | 'value'
  | 'category'
  | 'category-percent'
  | 'category-value';

export interface PieLabelInput {
  /** Caller-side identity so the result can be mapped back to a slice. */
  index: number;
  label: string;
  value: number;
  /** Fraction of the whole, 0..1. */
  share: number;
  startAngle: number;
  endAngle: number;
}

export interface PlannedInsideLabel {
  index: number;
  text: string;
  /** Centre of the label (caller centres the text on this point). */
  x: number;
  y: number;
}

export interface PlannedOutsideLabel {
  index: number;
  text: string;
  /** Text anchor point (paired with `align`). */
  x: number;
  y: number;
  align: 'left' | 'right';
  side: 'left' | 'right';
  /** Leader polyline: slice edge → radial elbow → label row. */
  points: Array<{ x: number; y: number }>;
}

export interface PieLabelPlan {
  /** Geometry the caller should draw the wedges with (may be shrunk/recentred). */
  cx: number;
  cy: number;
  outerR: number;
  innerR: number;
  inside: PlannedInsideLabel[];
  outside: PlannedOutsideLabel[];
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanPieLabelsOptions {
  slices: PieLabelInput[];
  cx: number;
  cy: number;
  outerR: number;
  innerR: number;
  area: Rect;
  placement: 'inside' | 'outside' | 'auto';
  /** When omitted, defaults to 'percent' inside and 'category-percent' outside. */
  content?: PieLabelContent;
  minShare: number;
  lineHeight: number;
  measure: (text: string) => number;
  formatValue: (value: number) => string;
}

const ELBOW = 12;
const GAP = 6;
const INSIDE_PAD = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Unit direction for an angle in the pie's "0 at top, clockwise" convention. */
function direction(angle: number): { x: number; y: number } {
  return { x: Math.sin(angle), y: -Math.cos(angle) };
}

/** Percentage text with adaptive precision (1 decimal under 10%, else whole). */
function formatPercent(share: number): string {
  const pct = share * 100;
  const text = pct < 10 ? pct.toFixed(1) : pct.toFixed(0);
  return `${text.replace(/\.0$/, '')}%`;
}

function labelText(
  slice: PieLabelInput,
  placement: 'inside' | 'outside',
  options: PlanPieLabelsOptions,
): string {
  const content = options.content ?? (placement === 'inside' ? 'percent' : 'category-percent');
  switch (content) {
    case 'percent':
      return formatPercent(slice.share);
    case 'value':
      return options.formatValue(slice.value);
    case 'category':
      return slice.label;
    case 'category-value':
      return `${slice.label} · ${options.formatValue(slice.value)}`;
    case 'category-percent':
    default:
      return `${slice.label} · ${formatPercent(slice.share)}`;
  }
}

/**
 * Spread label centres so neighbours never overlap (>= `lineHeight` apart) while
 * staying within `[top, bottom]`. Two-way relaxation: push down from the top,
 * shift up if it spills past the bottom, then re-settle from the top.
 */
function relaxColumn(idealYs: number[], lineHeight: number, top: number, bottom: number): number[] {
  const order = idealYs.map((y, i) => ({ i, y })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < order.length; k++) {
    if (order[k].y < order[k - 1].y + lineHeight) order[k].y = order[k - 1].y + lineHeight;
  }
  const last = order[order.length - 1];
  if (last && last.y > bottom) {
    const shift = last.y - bottom;
    for (const o of order) o.y -= shift;
  }
  if (order.length && order[0].y < top) {
    let prev = top - lineHeight;
    for (const o of order) {
      if (o.y < prev + lineHeight) o.y = prev + lineHeight;
      prev = o.y;
    }
  }
  const out = new Array<number>(idealYs.length);
  for (const o of order) out[o.i] = o.y;
  return out;
}

export function planPieLabels(options: PlanPieLabelsOptions): PieLabelPlan {
  const { slices, area, placement, minShare, lineHeight, measure } = options;
  const origOuterR = options.outerR;
  const origInnerR = options.innerR;

  // 1. Resolve inside vs. outside per slice using the original geometry.
  const insideSlices: Array<{ slice: PieLabelInput; mid: number; text: string }> = [];
  const outsideSlices: Array<{ slice: PieLabelInput; mid: number; text: string; side: 'left' | 'right' }> = [];

  const insideLabelR = origInnerR > 0 ? (origInnerR + origOuterR) / 2 : origOuterR * 0.62;
  const radialBand = origInnerR > 0 ? origOuterR - origInnerR : origOuterR;

  for (const slice of slices) {
    if (slice.share < minShare) continue;
    const mid = (slice.startAngle + slice.endAngle) / 2;

    let goesInside: boolean;
    if (placement === 'inside') goesInside = true;
    else if (placement === 'outside') goesInside = false;
    else {
      const insideText = labelText(slice, 'inside', options);
      const tangential = (slice.endAngle - slice.startAngle) * insideLabelR;
      const fitsTangential = measure(insideText) + INSIDE_PAD <= tangential;
      const fitsRadial = lineHeight * 0.8 <= radialBand;
      goesInside = fitsTangential && fitsRadial;
    }

    if (goesInside) {
      insideSlices.push({ slice, mid, text: labelText(slice, 'inside', options) });
    } else {
      const dir = direction(mid);
      outsideSlices.push({
        slice,
        mid,
        text: labelText(slice, 'outside', options),
        side: dir.x >= 0 ? 'right' : 'left',
      });
    }
  }

  // 2. Reserve horizontal room for outside labels by fitting the circle between
  //    two label columns; shrink + recentre as needed.
  let cx = options.cx;
  const cy = options.cy;
  let outerR = origOuterR;
  let innerR = origInnerR;

  if (outsideSlices.length > 0) {
    let maxLeftW = 0;
    let maxRightW = 0;
    for (const o of outsideSlices) {
      const w = measure(o.text);
      if (o.side === 'right') maxRightW = Math.max(maxRightW, w);
      else maxLeftW = Math.max(maxLeftW, w);
    }
    const capW = area.width * 0.34;
    const leftReserve = maxLeftW > 0 ? Math.min(maxLeftW + ELBOW + GAP, capW) : 0;
    const rightReserve = maxRightW > 0 ? Math.min(maxRightW + ELBOW + GAP, capW) : 0;
    const leftBound = area.x + leftReserve;
    const rightBound = area.x + area.width - rightReserve;
    const horizR = (rightBound - leftBound) / 2;
    const vertR = area.height * 0.46;
    outerR = clamp(Math.min(origOuterR, horizR, vertR), 16, origOuterR);
    const scale = origOuterR > 0 ? outerR / origOuterR : 1;
    innerR = origInnerR * scale;
    cx = (leftBound + rightBound) / 2;
  }

  // 3. Inside labels at the (possibly shrunk) mid-radius.
  const insideR = innerR > 0 ? (innerR + outerR) / 2 : outerR * 0.62;
  const inside: PlannedInsideLabel[] = insideSlices.map(({ slice, mid, text }) => {
    const dir = direction(mid);
    return { index: slice.index, text, x: cx + insideR * dir.x, y: cy + insideR * dir.y };
  });

  // 4. Outside callouts: anchor + radial elbow, then collision-resolve per side.
  const elbowR = outerR + ELBOW;
  const top = area.y + lineHeight / 2;
  const bottom = area.y + area.height - lineHeight / 2;
  const outside: PlannedOutsideLabel[] = [];

  for (const side of ['left', 'right'] as const) {
    const group = outsideSlices.filter((o) => o.side === side);
    if (group.length === 0) continue;
    const idealYs = group.map((o) => cy + elbowR * direction(o.mid).y);
    const ys = relaxColumn(idealYs, lineHeight, top, bottom);

    group.forEach((o, i) => {
      const dir = direction(o.mid);
      const anchor = { x: cx + outerR * dir.x, y: cy + outerR * dir.y };
      const elbow = { x: cx + elbowR * dir.x, y: cy + elbowR * dir.y };
      const labelY = ys[i];
      const textX = side === 'right' ? elbow.x + GAP : elbow.x - GAP;
      outside.push({
        index: o.slice.index,
        text: o.text,
        x: textX,
        y: labelY,
        align: side === 'right' ? 'left' : 'right',
        side,
        points: [anchor, elbow, { x: textX, y: labelY }],
      });
    });
  }

  return { cx, cy, outerR, innerR, inside, outside };
}
