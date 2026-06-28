import { sequential, sequentialColorScale, rgbaToCss } from '../color';
import { formatValue } from '../format';
import type { Surface } from '../render/surface';
import { fontString, measureText } from '../render/text';
import { RoughPen } from '../rough';
import { roundedRect } from '../shape';
import { resolveSketch } from '../spec/sketch';
import type { CalendarHeatmapSpec, ChartSpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Datum, Rect, Size } from '../types';
import { accessor, toDate, toNumber } from '../util/data';
import type { InteractionModel } from '../interaction/types';
import type { RenderContext } from './index';
import { addOverlayText, CHROME_PAD, drawTitleBlock } from './chrome';

const DAY_MS = 86_400_000;
const GAP = 2;
const MAX_CELL = 16;
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export interface CalendarDayValue {
  isoDate: string;
  date: Date;
  value: number;
}

export interface CalendarGridCell {
  isoDate: string;
  date: Date;
  week: number;
  weekday: number;
  value?: number;
  present: boolean;
}

export interface CalendarGrid {
  start: Date;
  end: Date;
  minDay: Date;
  maxDay: Date;
  weeks: number;
  cells: CalendarGridCell[];
  byIsoDate: Map<string, CalendarGridCell>;
}

interface LaidOutCell extends CalendarGridCell {
  x: number;
  y: number;
  size: number;
  fill: string;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function daySerial(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS;
}

function diffDays(a: Date, b: Date): number {
  return Math.round(daySerial(a) - daySerial(b));
}

function addDays(date: Date, days: number): Date {
  const d = startOfLocalDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

function drawRoundedCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, radius: number): void {
  ctx.beginPath();
  roundedRect(ctx, x, y, size, size, radius);
  ctx.fill();
}

function noData(surface: Surface, tokens: ThemeTokens, content: Rect): void {
  addOverlayText(surface, tokens, {
    left: content.x,
    top: content.y + Math.max(CHROME_PAD.top, content.height / 2 - tokens.font.size.small / 2),
    width: content.width,
    text: 'No data',
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
    align: 'center',
  });
}

function normalizeDays(days: ReadonlyMap<string, number> | readonly CalendarDayValue[]): CalendarDayValue[] {
  if (Array.isArray(days)) {
    return days
      .filter((d) => Number.isFinite(d.value))
      .map((d) => ({ isoDate: isoDay(d.date), date: startOfLocalDay(d.date), value: d.value }));
  }
  const out: CalendarDayValue[] = [];
  const dayMap = days as ReadonlyMap<string, number>;
  for (const [isoDate, value] of dayMap) {
    const date = toDate(isoDate);
    if (!date || !Number.isFinite(value)) continue;
    out.push({ isoDate: isoDay(date), date: startOfLocalDay(date), value });
  }
  return out;
}

export function buildCalendarGrid(days: ReadonlyMap<string, number> | readonly CalendarDayValue[]): CalendarGrid {
  const values = normalizeDays(days).sort((a, b) => daySerial(a.date) - daySerial(b.date));
  if (values.length === 0) {
    const today = startOfLocalDay(new Date(0));
    return { start: today, end: today, minDay: today, maxDay: today, weeks: 0, cells: [], byIsoDate: new Map() };
  }

  const minDay = values[0].date;
  const maxDay = values[values.length - 1].date;
  const start = addDays(minDay, -minDay.getDay());
  const end = addDays(maxDay, 6 - maxDay.getDay());
  const weeks = Math.floor(diffDays(end, start) / 7) + 1;
  const byValue = new Map(values.map((d) => [d.isoDate, d.value]));
  const cells: CalendarGridCell[] = [];
  const byIsoDate = new Map<string, CalendarGridCell>();

  for (let d = start; diffDays(end, d) >= 0; d = addDays(d, 1)) {
    const isoDate = isoDay(d);
    const value = byValue.get(isoDate);
    const cell: CalendarGridCell = {
      isoDate,
      date: d,
      week: Math.floor(diffDays(d, start) / 7),
      weekday: d.getDay(),
      value,
      present: value !== undefined,
    };
    cells.push(cell);
    byIsoDate.set(isoDate, cell);
  }

  return { start, end, minDay, maxDay, weeks, cells, byIsoDate };
}

function collectDays(spec: CalendarHeatmapSpec): CalendarDayValue[] {
  const readDate = accessor(spec.encoding.date.field);
  const readColor = accessor(spec.encoding.color.field);
  const totals = new Map<string, { date: Date; value: number }>();

  for (const row of spec.data ?? []) {
    const date = toDate(readDate(row as Datum));
    const value = toNumber(readColor(row as Datum));
    if (!date || !Number.isFinite(value)) continue;
    const day = startOfLocalDay(date);
    const isoDate = isoDay(day);
    const current = totals.get(isoDate);
    if (current) current.value += value;
    else totals.set(isoDate, { date: day, value });
  }

  return [...totals.entries()].map(([isoDate, { date, value }]) => ({ isoDate, date, value }));
}

function monthAnchors(grid: CalendarGrid): { label: string; week: number }[] {
  const seen = new Set<string>();
  const out: { label: string; week: number }[] = [];
  for (let d = grid.minDay; diffDays(grid.maxDay, d) >= 0; d = addDays(d, 1)) {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ label: MONTH_LABELS[d.getMonth()], week: Math.floor(diffDays(d, grid.start) / 7) });
  }
  return out;
}

function humanDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function drawCalendarHeatmap(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  void context;
  const cal = spec as CalendarHeatmapSpec;
  const ctx = surface.marks.ctx;
  const content = drawTitleBlock(surface, tokens, size, cal.title);
  const days = collectDays(cal);
  const grid = buildCalendarGrid(days);

  if (days.length === 0 || content.width <= 0 || content.height <= 0) {
    noData(surface, tokens, content);
    return;
  }

  const labelSize = tokens.font.size.tiny;
  const labelFont = fontString(labelSize, tokens.font.family, tokens.font.weight.normal);
  const leftGutter = Math.ceil(Math.max(...['Mon', 'Wed', 'Fri'].map((d) => measureText(d, labelFont).width)) + tokens.spacing.sm);
  const labelHeight = Math.ceil(labelSize * 1.7) + 2;
  const availableW = Math.max(0, content.width - leftGutter);
  const availableH = Math.max(0, content.height - labelHeight);
  const cell = Math.floor(Math.min(MAX_CELL, (availableW - GAP * Math.max(0, grid.weeks - 1)) / grid.weeks, (availableH - GAP * 6) / 7));

  if (!Number.isFinite(cell) || cell <= 0) {
    noData(surface, tokens, content);
    return;
  }

  const gridRect: Rect = {
    x: content.x + leftGutter,
    y: content.y + labelHeight,
    width: grid.weeks * cell + Math.max(0, grid.weeks - 1) * GAP,
    height: 7 * cell + 6 * GAP,
  };
  const values = days.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const interp = sequential(cal.scheme ?? 'teal');
  const cscale = sequentialColorScale({ domain: [min, max], interpolator: interp });
  const sketch = resolveSketch(spec);
  const pen = sketch ? new RoughPen(ctx, sketch) : null;
  const radius = Math.min(3, tokens.radius.sm, cell / 3);
  const laidOut = new Map<string, LaidOutCell>();

  ctx.save();
  for (const c of grid.cells) {
    const x = gridRect.x + c.week * (cell + GAP);
    const y = gridRect.y + c.weekday * (cell + GAP);
    const fill = c.present && c.value !== undefined ? rgbaToCss(cscale.map(c.value)) : tokens.color.surface;
    laidOut.set(c.isoDate, { ...c, x, y, size: cell, fill });

    if (pen) {
      pen.rect(x, y, cell, cell, {
        fill,
        fillStyle: 'solid',
        stroke: c.present ? fill : tokens.color.border,
      });
    } else {
      ctx.fillStyle = fill;
      drawRoundedCell(ctx, x, y, cell, radius);
      ctx.strokeStyle = tokens.color.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, cell - 1), Math.max(0, cell - 1));
    }
  }
  ctx.restore();

  for (const m of monthAnchors(grid)) {
    addOverlayText(surface, tokens, {
      left: gridRect.x + m.week * (cell + GAP),
      top: content.y,
      text: m.label,
      color: tokens.color.textMuted,
      size: labelSize,
    });
  }

  for (const weekday of [1, 3, 5]) {
    addOverlayText(surface, tokens, {
      left: content.x,
      top: gridRect.y + weekday * (cell + GAP) + cell / 2,
      width: Math.max(0, leftGutter - tokens.spacing.xs),
      text: WEEKDAY_LABELS[weekday],
      color: tokens.color.textMuted,
      size: labelSize,
      align: 'right',
      transform: 'translateY(-50%)',
    });
  }

  const colorLabel = cal.encoding.color.title ?? cal.encoding.color.field;
  const hitCell = (px: number, py: number): LaidOutCell | null => {
    if (px < gridRect.x || py < gridRect.y || px > gridRect.x + gridRect.width || py > gridRect.y + gridRect.height) return null;
    const week = Math.floor((px - gridRect.x) / (cell + GAP));
    const weekday = Math.floor((py - gridRect.y) / (cell + GAP));
    const x = gridRect.x + week * (cell + GAP);
    const y = gridRect.y + weekday * (cell + GAP);
    if (week < 0 || week >= grid.weeks || weekday < 0 || weekday > 6 || px > x + cell || py > y + cell) return null;
    const match = grid.cells.find((c) => c.week === week && c.weekday === weekday);
    if (!match || !match.present) return null;
    return laidOut.get(match.isoDate) ?? null;
  };

  return {
    region: gridRect,
    hitTest: (px, py) => {
      const c = hitCell(px, py);
      if (!c || c.value === undefined) return null;
      return {
        key: c.isoDate,
        anchorX: px,
        anchorY: py,
        content: {
          title: humanDate(c.date),
          rows: [{ swatch: c.fill, label: colorLabel, value: formatValue(c.value, cal.encoding.color.format) }],
        },
      };
    },
    pick: (px, py) => {
      const c = hitCell(px, py);
      if (!c) return null;
      return { kind: 'point', fields: [cal.encoding.date.field], tuples: [[c.isoDate]] };
    },
  };
}
