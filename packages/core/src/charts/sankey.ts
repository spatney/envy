import { ordinalColorScale, rgbaToCss, withAlpha } from '../color';
import { formatValue } from '../format';
import type { Surface } from '../render/surface';
import { fontString, measureText } from '../render/text';
import { roundedRect } from '../shape';
import { RoughPen } from '../rough';
import { resolveSketch } from '../spec/sketch';
import type { ChartSpec, SankeySpec } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Rect, Size } from '../types';
import { accessor, toKey, toNumber } from '../util/data';
import type { InteractionModel, TooltipRow } from '../interaction/types';
import { addOverlayText, drawTitleBlock } from './chrome';

interface SNode {
  name: string;
  index: number;
  layer: number;
  value: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  color: string;
  sourceLinks: SLink[];
  targetLinks: SLink[];
}

interface SLink {
  source: SNode;
  target: SNode;
  value: number;
  width: number;
  sy: number;
  ty: number;
}

interface Graph {
  nodes: SNode[];
  links: SLink[];
  columns: SNode[][];
  maxLayer: number;
}

const center = (n: SNode): number => (n.y0 + n.y1) / 2;

function buildGraph(spec: SankeySpec, palette: string[]): Graph {
  const readS = accessor(spec.encoding.source.field);
  const readT = accessor(spec.encoding.target.field);
  const readV = accessor(spec.encoding.value.field);
  const nodeByName = new Map<string, SNode>();
  const order: SNode[] = [];
  const scale = ordinalColorScale({ palette });

  const ensure = (name: string): SNode => {
    let n = nodeByName.get(name);
    if (!n) {
      n = {
        name,
        index: order.length,
        layer: 0,
        value: 0,
        x0: 0,
        x1: 0,
        y0: 0,
        y1: 0,
        color: rgbaToCss(scale.map(name)),
        sourceLinks: [],
        targetLinks: [],
      };
      nodeByName.set(name, n);
      order.push(n);
    }
    return n;
  };

  const links: SLink[] = [];
  for (const row of spec.data ?? []) {
    const sName = toKey(readS(row));
    const tName = toKey(readT(row));
    const value = toNumber(readV(row));
    if (sName === '' || tName === '' || sName === tName || !Number.isFinite(value) || value <= 0) {
      continue;
    }
    const source = ensure(sName);
    const target = ensure(tName);
    const link: SLink = { source, target, value, width: 0, sy: 0, ty: 0 };
    source.sourceLinks.push(link);
    target.targetLinks.push(link);
    links.push(link);
  }

  for (const n of order) {
    const out = n.sourceLinks.reduce((s, l) => s + l.value, 0);
    const inc = n.targetLinks.reduce((s, l) => s + l.value, 0);
    n.value = Math.max(out, inc);
  }

  assignLayers(order);
  const maxLayer = order.reduce((m, n) => Math.max(m, n.layer), 0);
  const columns: SNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of order) columns[n.layer].push(n);

  return { nodes: order, links, columns, maxLayer };
}

/** Longest-path layering via Kahn topological order; sinks pushed to the last column. */
function assignLayers(nodes: SNode[]): void {
  const indeg = new Map<SNode, number>();
  for (const n of nodes) indeg.set(n, n.targetLinks.length);
  const queue = nodes.filter((n) => (indeg.get(n) ?? 0) === 0);
  const seen = new Set<SNode>();
  while (queue.length) {
    const n = queue.shift()!;
    seen.add(n);
    for (const l of n.sourceLinks) {
      const t = l.target;
      if (t.layer < n.layer + 1) t.layer = n.layer + 1;
      const d = (indeg.get(t) ?? 0) - 1;
      indeg.set(t, d);
      if (d === 0) queue.push(t);
    }
  }
  const maxLayer = nodes.reduce((m, n) => Math.max(m, n.layer), 0);
  // Right-align pure sinks so terminal nodes line up on the right edge.
  for (const n of nodes) {
    if (n.sourceLinks.length === 0 && n.targetLinks.length > 0) n.layer = maxLayer;
  }
}

function layout(graph: Graph, area: Rect, nodeWidth: number, pad: number): void {
  const { columns, links, maxLayer } = graph;
  const kx = maxLayer > 0 ? (area.width - nodeWidth) / maxLayer : 0;
  for (const col of columns) {
    for (const n of col) {
      n.x0 = area.x + n.layer * kx;
      n.x1 = n.x0 + nodeWidth;
    }
  }

  let ky = Infinity;
  for (const col of columns) {
    if (col.length === 0) continue;
    const sum = col.reduce((s, n) => s + n.value, 0);
    const avail = area.height - (col.length - 1) * pad;
    if (sum > 0 && avail > 0) ky = Math.min(ky, avail / sum);
  }
  if (!Number.isFinite(ky) || ky <= 0) ky = 1;

  for (const col of columns) {
    let y = area.y;
    for (const n of col) {
      n.y0 = y;
      n.y1 = y + Math.max(1, n.value * ky);
      y = n.y1 + pad;
    }
    centerColumn(col, area);
  }
  for (const l of links) l.width = Math.max(1, l.value * ky);

  for (let i = 0; i < 6; i += 1) {
    const alpha = Math.pow(0.97, i);
    relax(columns, true, alpha);
    resolveAll(columns, area, pad);
    relax(columns, false, alpha);
    resolveAll(columns, area, pad);
  }
  computeLinkBreadths(graph);
}

function centerColumn(col: SNode[], area: Rect): void {
  if (col.length === 0) return;
  const extent = col[col.length - 1].y1 - col[0].y0;
  const dy = area.y + (area.height - extent) / 2 - col[0].y0;
  if (Math.abs(dy) < 0.01) return;
  for (const n of col) {
    n.y0 += dy;
    n.y1 += dy;
  }
}

function relax(columns: SNode[][], leftToRight: boolean, alpha: number): void {
  const seq = leftToRight ? columns : [...columns].reverse();
  for (const col of seq) {
    for (const n of col) {
      const linkSet = leftToRight ? n.targetLinks : n.sourceLinks;
      let w = 0;
      let sum = 0;
      for (const l of linkSet) {
        const other = leftToRight ? l.source : l.target;
        sum += center(other) * l.value;
        w += l.value;
      }
      if (w <= 0) continue;
      const dy = (sum / w - center(n)) * alpha;
      n.y0 += dy;
      n.y1 += dy;
    }
  }
}

function resolveAll(columns: SNode[][], area: Rect, pad: number): void {
  for (const col of columns) resolveCollisions(col, area, pad);
}

function resolveCollisions(col: SNode[], area: Rect, pad: number): void {
  col.sort((a, b) => a.y0 - b.y0);
  let y = area.y;
  for (const n of col) {
    const dy = y - n.y0;
    if (dy > 0) {
      n.y0 += dy;
      n.y1 += dy;
    }
    y = n.y1 + pad;
  }
  y = area.y + area.height;
  for (let i = col.length - 1; i >= 0; i -= 1) {
    const n = col[i];
    const dy = n.y1 - y;
    if (dy > 0) {
      n.y0 -= dy;
      n.y1 -= dy;
    }
    y = n.y0 - pad;
  }
}

function computeLinkBreadths(graph: Graph): void {
  for (const n of graph.nodes) {
    n.sourceLinks.sort((a, b) => center(a.target) - center(b.target));
    n.targetLinks.sort((a, b) => center(a.source) - center(b.source));
    let sy = n.y0;
    for (const l of n.sourceLinks) {
      l.sy = sy + l.width / 2;
      sy += l.width;
    }
    let ty = n.y0;
    for (const l of n.targetLinks) {
      l.ty = ty + l.width / 2;
      ty += l.width;
    }
  }
}

function strokeLink(ctx: CanvasRenderingContext2D, l: SLink, color: string): void {
  const x0 = l.source.x1;
  const x1 = l.target.x0;
  const xm = (x0 + x1) / 2;
  ctx.lineWidth = l.width;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, l.sy);
  ctx.bezierCurveTo(xm, l.sy, xm, l.ty, x1, l.ty);
  ctx.stroke();
}

export function drawSankey(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
): InteractionModel | void {
  const sankey = spec as SankeySpec;
  const content = drawTitleBlock(surface, tokens, size, sankey.title);
  const f = tokens.font;
  const graph = buildGraph(sankey, tokens.color.palette);
  if (graph.nodes.length === 0 || content.width <= 0 || content.height <= 0) return;

  const labelFont = fontString(f.size.small, f.family, f.weight.medium);
  let maxLabel = 0;
  for (const n of graph.nodes) maxLabel = Math.max(maxLabel, measureText(n.name, labelFont).width);
  const gutter = Math.min(maxLabel + 12, content.width * 0.24);
  const nodeWidth = sankey.nodeWidth ?? 16;
  const pad = sankey.nodePadding ?? 14;
  const area: Rect = {
    x: content.x + gutter,
    y: content.y + 4,
    width: Math.max(10, content.width - gutter * 2),
    height: Math.max(10, content.height - 8),
  };

  layout(graph, area, nodeWidth, pad);

  const ctx = surface.marks.ctx;
  ctx.save();
  ctx.lineCap = 'butt';

  // Links first (widest underneath), colored by source node.
  const sorted = [...graph.links].sort((a, b) => b.width - a.width);
  for (const l of sorted) strokeLink(ctx, l, withAlpha(l.source.color, 0.4));

  // Nodes.
  const radius = Math.min(3, tokens.radius.sm);
  const sketch = resolveSketch(spec);
  const pen = sketch ? new RoughPen(ctx, sketch) : null;
  for (const n of graph.nodes) {
    const h = Math.max(1, n.y1 - n.y0);
    if (pen) {
      pen.rect(n.x0, n.y0, nodeWidth, h, { fill: n.color, fillStyle: 'solid' });
    } else {
      ctx.fillStyle = n.color;
      ctx.beginPath();
      roundedRect(ctx, n.x0, n.y0, nodeWidth, h, Math.min(radius, h / 2));
      ctx.fill();
    }
  }
  ctx.restore();

  // Labels (in the gutter on the side with more room).
  const showValues = sankey.nodeValues !== false;
  const mid = area.x + area.width / 2;
  for (const n of graph.nodes) {
    const labelRight = n.x0 < mid;
    const cy = center(n);
    const left = labelRight ? n.x1 + 6 : n.x0 - 6;
    const transform = labelRight ? 'translateY(-50%)' : 'translate(-100%,-50%)';
    addOverlayText(surface, tokens, {
      left,
      top: showValues ? cy - f.size.small * 0.62 : cy,
      text: n.name,
      color: tokens.color.text,
      size: f.size.small,
      weight: f.weight.medium,
      transform,
    });
    if (showValues) {
      addOverlayText(surface, tokens, {
        left,
        top: cy + f.size.small * 0.62,
        text: formatValue(n.value, sankey.encoding.value.format),
        color: tokens.color.textMuted,
        size: f.size.tiny,
        transform,
      });
    }
  }

  const tt = sankey.tooltip;
  if (tt === false || (tt && typeof tt === 'object' && tt.show === false)) return;

  const valueLabel = sankey.encoding.value.title ?? sankey.encoding.value.field;
  return {
    region: content,
    hitTest: (px, py) => {
      const n = graph.nodes.find(
        (node) => px >= node.x0 - 1 && px <= node.x1 + 1 && py >= node.y0 && py <= node.y1,
      );
      if (!n) return null;
      const out = n.sourceLinks.reduce((s, l) => s + l.value, 0);
      const inc = n.targetLinks.reduce((s, l) => s + l.value, 0);
      const rows: TooltipRow[] = [
        { swatch: n.color, label: valueLabel, value: formatValue(n.value, sankey.encoding.value.format) },
      ];
      if (inc > 0) rows.push({ label: 'In', value: formatValue(inc, sankey.encoding.value.format), muted: true });
      if (out > 0) rows.push({ label: 'Out', value: formatValue(out, sankey.encoding.value.format), muted: true });
      return {
        key: n.name,
        anchorX: (n.x0 + n.x1) / 2,
        anchorY: center(n),
        content: { title: n.name, rows },
        draw: (ictx) => {
          ictx.save();
          ictx.lineCap = 'butt';
          for (const l of [...n.sourceLinks, ...n.targetLinks]) {
            strokeLink(ictx, l, withAlpha(l.source.color, 0.72));
          }
          const h = Math.max(1, n.y1 - n.y0);
          ictx.fillStyle = n.color;
          ictx.beginPath();
          roundedRect(ictx, n.x0, n.y0, n.x1 - n.x0, h, Math.min(3, h / 2));
          ictx.fill();
          ictx.restore();
        },
      };
    },
  };
}
