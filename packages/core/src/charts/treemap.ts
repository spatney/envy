import { ordinalColorScale, sequentialColorScale, sequential, rgbaToCss, readableTextColor, parseColor } from '../color';
import { formatValue } from '../format';
import { accessor, toNumber, toKey } from '../util/data';
import { RoughPen } from '../rough';
import { resolveSketch } from '../spec/sketch';
import { addOverlayText, drawTitleBlock, CHROME_PAD } from './chrome';
import type { ChartSpec, TreemapSpec } from '../spec/types';
import type { Surface } from '../render/surface';
import type { ThemeTokens } from '../theme';
import type { InteractionModel } from '../interaction/types';
import type { RenderContext } from './index';
import type { Rect, RGBA, Size } from '../types';

export interface TreemapLayoutInput {
  value: number;
}

export interface TreemapLayoutNode<T extends TreemapLayoutInput = TreemapLayoutInput> {
  item: T;
  rect: Rect;
}

interface Leaf extends TreemapLayoutInput {
  key: string;
  category: unknown;
  categoryLabel: string;
  value: number;
  group?: unknown;
  groupKey?: string;
  groupLabel?: string;
  colorValue?: unknown;
  colorNumber?: number;
  fill: RGBA;
  fillCss: string;
}

interface GroupItem extends TreemapLayoutInput {
  key: string;
  label: string;
  value: number;
  leaves: Leaf[];
}

interface Tile extends Leaf {
  rect: Rect;
}

const MIN_LABEL_WIDTH = 38;
const MIN_LABEL_HEIGHT = 24;

function cleanRect(rect: Rect): Rect {
  return {
    x: Number.isFinite(rect.x) ? rect.x : 0,
    y: Number.isFinite(rect.y) ? rect.y : 0,
    width: Math.max(0, Number.isFinite(rect.width) ? rect.width : 0),
    height: Math.max(0, Number.isFinite(rect.height) ? rect.height : 0),
  };
}

function worst(row: readonly number[], side: number): number {
  if (row.length === 0 || side <= 0) return Infinity;
  let sum = 0;
  let min = Infinity;
  let max = 0;
  for (const area of row) {
    sum += area;
    min = Math.min(min, area);
    max = Math.max(max, area);
  }
  if (sum <= 0 || min <= 0) return Infinity;
  const side2 = side * side;
  return Math.max((side2 * max) / (sum * sum), (sum * sum) / (side2 * min));
}

function layoutRow<T extends TreemapLayoutInput>(
  row: readonly { item: T; area: number }[],
  rect: Rect,
  out: TreemapLayoutNode<T>[],
): Rect {
  const area = row.reduce((sum, d) => sum + d.area, 0);
  if (area <= 0 || rect.width <= 0 || rect.height <= 0) return rect;

  if (rect.height >= rect.width) {
    const h = Math.min(rect.height, area / rect.width);
    let x = rect.x;
    for (let i = 0; i < row.length; i++) {
      const w = i === row.length - 1 ? rect.x + rect.width - x : row[i].area / h;
      out.push({ item: row[i].item, rect: { x, y: rect.y, width: Math.max(0, w), height: h } });
      x += w;
    }
    return { x: rect.x, y: rect.y + h, width: rect.width, height: Math.max(0, rect.height - h) };
  }

  const w = Math.min(rect.width, area / rect.height);
  let y = rect.y;
  for (let i = 0; i < row.length; i++) {
    const h = i === row.length - 1 ? rect.y + rect.height - y : row[i].area / w;
    out.push({ item: row[i].item, rect: { x: rect.x, y, width: w, height: Math.max(0, h) } });
    y += h;
  }
  return { x: rect.x + w, y: rect.y, width: Math.max(0, rect.width - w), height: rect.height };
}

/** Squarified treemap layout. Input order is preserved for deterministic agent output. */
export function layoutTreemap<T extends TreemapLayoutInput>(items: readonly T[], rect: Rect): TreemapLayoutNode<T>[] {
  const box = cleanRect(rect);
  const total = items.reduce((sum, item) => (Number.isFinite(item.value) && item.value > 0 ? sum + item.value : sum), 0);
  const area = box.width * box.height;
  if (total <= 0 || area <= 0) return [];

  const pending = items
    .filter((item) => Number.isFinite(item.value) && item.value > 0)
    .map((item) => ({ item, area: (item.value / total) * area }));
  const out: TreemapLayoutNode<T>[] = [];
  let rest = box;
  let row: { item: T; area: number }[] = [];
  let rowAreas: number[] = [];

  const flush = () => {
    if (row.length === 0) return;
    rest = layoutRow(row, rest, out);
    row = [];
    rowAreas = [];
  };

  for (const next of pending) {
    const side = Math.min(rest.width, rest.height);
    if (row.length === 0 || worst([...rowAreas, next.area], side) <= worst(rowAreas, side)) {
      row.push(next);
      rowAreas.push(next.area);
    } else {
      flush();
      row.push(next);
      rowAreas.push(next.area);
    }
  }
  flush();
  return out;
}

function insetRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x + pad,
    y: rect.y + pad,
    width: Math.max(0, rect.width - pad * 2),
    height: Math.max(0, rect.height - pad * 2),
  };
}

function labelFor(value: unknown): string {
  const key = toKey(value);
  return key === '' ? '(blank)' : key;
}

function buildLeaves(treemap: TreemapSpec): Leaf[] {
  const readCategory = accessor(treemap.encoding.category.field);
  const readValue = accessor(treemap.encoding.value.field);
  const readGroup = treemap.encoding.group ? accessor(treemap.encoding.group.field) : null;
  const readColor = treemap.encoding.color ? accessor(treemap.encoding.color.field) : null;
  const order: string[] = [];
  const totals = new Map<string, Leaf>();

  for (const row of treemap.data ?? []) {
    const rawCategory = readCategory(row);
    const categoryKey = toKey(rawCategory);
    const rawGroup = readGroup ? readGroup(row) : undefined;
    const groupKey = readGroup ? toKey(rawGroup) : undefined;
    const key = groupKey === undefined ? categoryKey : `${groupKey}\u0000${categoryKey}`;
    const value = toNumber(readValue(row));
    if (!Number.isFinite(value) || value <= 0) continue;

    let leaf = totals.get(key);
    if (!leaf) {
      const colorValue = readColor ? readColor(row) : undefined;
      const colorNumber = colorValue === undefined ? undefined : toNumber(colorValue);
      leaf = {
        key,
        category: rawCategory,
        categoryLabel: labelFor(rawCategory),
        value: 0,
        group: rawGroup,
        groupKey,
        groupLabel: groupKey === undefined ? undefined : labelFor(rawGroup),
        colorValue,
        colorNumber: Number.isFinite(colorNumber) ? colorNumber : undefined,
        fill: { r: 0, g: 0, b: 0, a: 1 },
        fillCss: '#000',
      };
      totals.set(key, leaf);
      order.push(key);
    }
    leaf.value += value;
  }

  return order.map((key) => totals.get(key)!);
}

function colorLeaves(leaves: Leaf[], treemap: TreemapSpec, tokens: ThemeTokens): void {
  const fallback = parseColor(tokens.color.surface) ?? parseColor(tokens.color.palette[0] ?? '#14b8a6') ?? { r: 20, g: 184, b: 166, a: 1 };
  const color = treemap.encoding.color;
  const ordinal = ordinalColorScale({ palette: tokens.color.palette });
  const numericValues = color ? leaves.map((leaf) => leaf.colorNumber).filter((n): n is number => n !== undefined) : [];
  const numericColor = Boolean(color && (color.type === 'quantitative' || (numericValues.length > 0 && numericValues.length === leaves.length)));
  const domain: [number, number] = numericValues.length
    ? [Math.min(...numericValues), Math.max(...numericValues)]
    : [0, 1];
  const continuous = sequentialColorScale({ domain, interpolator: sequential(treemap.scheme ?? 'teal') });

  for (const leaf of leaves) {
    let fill: RGBA = fallback;
    if (color) {
      if (numericColor) fill = continuous.map(leaf.colorNumber ?? domain[0]);
      else fill = ordinal.map(toKey(leaf.colorValue));
    } else if (treemap.encoding.group && leaf.groupKey !== undefined) {
      fill = ordinal.map(leaf.groupKey);
    } else {
      fill = ordinal.map(leaf.categoryLabel);
    }
    leaf.fill = fill;
    leaf.fillCss = rgbaToCss(fill);
  }
}

function buildGroups(leaves: readonly Leaf[]): GroupItem[] {
  const order: string[] = [];
  const groups = new Map<string, GroupItem>();
  for (const leaf of leaves) {
    const key = leaf.groupKey ?? '';
    let group = groups.get(key);
    if (!group) {
      group = { key, label: leaf.groupLabel ?? '(blank)', value: 0, leaves: [] };
      groups.set(key, group);
      order.push(key);
    }
    group.value += leaf.value;
    group.leaves.push(leaf);
  }
  return order.map((key) => groups.get(key)!);
}

function drawRect(ctx: CanvasRenderingContext2D, pen: RoughPen | null, rect: Rect, fill: string, stroke: string): void {
  if (rect.width <= 0 || rect.height <= 0) return;
  if (pen) {
    pen.rect(rect.x, rect.y, rect.width, rect.height, { fill, stroke, fillStyle: 'solid' });
    return;
  }
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
}

function addTileLabels(surface: Surface, tokens: ThemeTokens, tile: Tile, valueFormat?: string): void {
  if (tile.rect.width < MIN_LABEL_WIDTH || tile.rect.height < MIN_LABEL_HEIGHT) return;
  const pad = 5;
  const textColor = readableTextColor(tile.fill);
  const textCss = rgbaToCss(textColor);
  const valueCss = rgbaToCss({ ...textColor, a: 0.72 });
  const labelSize = tokens.font.size.small;
  const valueSize = tokens.font.size.tiny;
  const maxWidth = Math.max(0, tile.rect.width - pad * 2);

  addOverlayText(surface, tokens, {
    left: tile.rect.x + pad,
    top: tile.rect.y + pad,
    width: maxWidth,
    text: tile.categoryLabel,
    color: textCss,
    size: labelSize,
    weight: tokens.font.weight.bold,
  });
  if (tile.rect.height >= 38) {
    addOverlayText(surface, tokens, {
      left: tile.rect.x + pad,
      top: tile.rect.y + pad + labelSize + 2,
      width: maxWidth,
      text: formatValue(tile.value, valueFormat),
      color: valueCss,
      size: valueSize,
    });
  }
}

export function drawTreemap(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): InteractionModel | void {
  void context;
  const treemap = spec as TreemapSpec;
  const ctx = surface.marks.ctx;
  const content = drawTitleBlock(surface, tokens, size, treemap.title);
  const leaves = buildLeaves(treemap);
  colorLeaves(leaves, treemap, tokens);
  const total = leaves.reduce((sum, leaf) => sum + leaf.value, 0);

  if (leaves.length === 0 || total <= 0 || content.width <= 0 || content.height <= 0) {
    addOverlayText(surface, tokens, {
      left: content.x,
      top: content.y + Math.max(CHROME_PAD.top, content.height / 2 - tokens.font.size.small / 2),
      width: content.width,
      text: 'No positive values',
      color: tokens.color.textMuted,
      size: tokens.font.size.small,
      align: 'center',
    });
    return;
  }

  const sketch = resolveSketch(spec);
  const pen = sketch ? new RoughPen(ctx, sketch) : null;
  const tiles: Tile[] = [];
  const stroke = tokens.color.background;
  const groupRects: { group: GroupItem; rect: Rect; headerH: number }[] = [];

  ctx.save();
  if (treemap.encoding.group) {
    const groups = buildGroups(leaves);
    for (const groupNode of layoutTreemap(groups, content)) {
      const gRect = groupNode.rect;
      const headerH = gRect.width >= 46 && gRect.height >= 40 ? tokens.font.size.tiny + 8 : 0;
      groupRects.push({ group: groupNode.item, rect: gRect, headerH });
      const inner = insetRect(
        { x: gRect.x, y: gRect.y + headerH, width: gRect.width, height: Math.max(0, gRect.height - headerH) },
        2,
      );
      for (const leafNode of layoutTreemap(groupNode.item.leaves, inner)) {
        const tile = { ...leafNode.item, rect: leafNode.rect };
        tiles.push(tile);
        drawRect(ctx, pen, tile.rect, tile.fillCss, stroke);
      }
    }
  } else {
    for (const leafNode of layoutTreemap(leaves, content)) {
      const tile = { ...leafNode.item, rect: leafNode.rect };
      tiles.push(tile);
      drawRect(ctx, pen, tile.rect, tile.fillCss, stroke);
    }
  }
  ctx.restore();

  if (treemap.encoding.group) {
    for (const { group, rect, headerH } of groupRects) {
      if (pen) pen.rect(rect.x, rect.y, rect.width, rect.height, { stroke, roughness: sketch!.roughness * 0.6 });
      else {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, Math.max(0, rect.width - 1), Math.max(0, rect.height - 1));
      }
      if (headerH > 0) {
        addOverlayText(surface, tokens, {
          left: rect.x + 5,
          top: rect.y + 4,
          width: Math.max(0, rect.width - 10),
          text: group.label,
          color: tokens.color.text,
          size: tokens.font.size.tiny,
          weight: tokens.font.weight.bold,
          opacity: 0.78,
        });
      }
    }
  }

  if (treemap.labels !== false) {
    for (const tile of tiles) addTileLabels(surface, tokens, tile, treemap.encoding.value.format);
  }

  const valueLabel = treemap.encoding.value.title ?? treemap.encoding.value.field;
  const categoryField = treemap.encoding.category.field;
  const groupField = treemap.encoding.group?.field;
  const hitTile = (px: number, py: number): Tile | null => {
    for (let i = tiles.length - 1; i >= 0; i--) {
      const tile = tiles[i];
      if (px >= tile.rect.x && px <= tile.rect.x + tile.rect.width && py >= tile.rect.y && py <= tile.rect.y + tile.rect.height) return tile;
    }
    return null;
  };

  return {
    region: { x: content.x, y: content.y, width: content.width, height: content.height },
    hitTest: (px, py) => {
      const tile = hitTile(px, py);
      if (!tile) return null;
      return {
        key: tile.key,
        anchorX: px,
        anchorY: py,
        content: {
          title: groupField ? `${tile.groupLabel ?? '(blank)'} ▸ ${tile.categoryLabel}` : tile.categoryLabel,
          rows: [
            { swatch: tile.fillCss, label: valueLabel, value: formatValue(tile.value, treemap.encoding.value.format) },
            { label: 'share', value: `${((tile.value / total) * 100).toFixed(1)}%`, muted: true },
          ],
        },
      };
    },
    pick: (px, py) => {
      const tile = hitTile(px, py);
      if (!tile) return null;
      return groupField
        ? { kind: 'point', fields: [categoryField, groupField], tuples: [[tile.category, tile.group]] }
        : { kind: 'point', fields: [categoryField], tuples: [[tile.category]] };
    },
  };
}
