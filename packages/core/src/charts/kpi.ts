import { formatNumber, formatValue } from '../format';
import { aggregateValues } from '../pivot';
import type { Surface } from '../render/surface';
import { getDevicePixelRatio } from '../render/env';
import { RoughPen } from '../rough';
import { resolveSketch, type ResolvedSketch } from '../spec/sketch';
import type { ChartSpec, KpiSpec, ValueRef } from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Datum, Point, Rect, Size } from '../types';
import { accessor, toNumber } from '../util/data';
import { CHROME_PAD, drawTitleBlock } from './chrome';
import { fontString } from '../render/text';
import { paintCanvasText } from '../render/overlayText';
import { roundedRect } from '../shape';
import type { RenderContext } from './index';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** A wobbly, asymmetric border-radius that reads as a hand-drawn card outline. */
const SKETCH_BORDER_RADIUS = '255px 15px 225px 15px / 15px 225px 15px 255px';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveValue(ref: ValueRef | undefined, data: readonly Datum[]): number | null {
  if (ref == null) return null;
  if (typeof ref === 'number') return Number.isFinite(ref) ? ref : null;
  const read = accessor(ref.field);
  return aggregateValues(
    data.map((d) => read(d)),
    ref.aggregate ?? 'sum',
  );
}

function valueField(ref: ValueRef): string | null {
  return typeof ref === 'number' ? null : ref.field;
}

export function formatDelta(delta: number, specFormat?: string): string {
  const sign = delta >= 0 ? '+' : '-';
  const abs = Math.abs(delta);
  if (specFormat) return sign + formatValue(abs, specFormat);
  if (abs <= 1) return sign + formatNumber(abs, '.1%');
  return sign + formatNumber(abs, ',.0f');
}

function cardRectFor(surface: Surface, tokens: ThemeTokens, size: Size, spec: KpiSpec): Rect {
  if (spec.title) return drawTitleBlock(surface, tokens, size, spec.title);
  return {
    x: CHROME_PAD.left,
    y: CHROME_PAD.top,
    width: Math.max(0, size.width - CHROME_PAD.left - CHROME_PAD.right),
    height: Math.max(0, size.height - CHROME_PAD.top - CHROME_PAD.bottom),
  };
}

function createCard(tokens: ThemeTokens, rect: Rect, hasSparkline: boolean, framed = false): HTMLDivElement {
  const card = document.createElement('div');
  const pad = tokens.spacing.lg;
  const sparkReserve = hasSparkline ? Math.min(44, Math.max(28, rect.height * 0.18)) + tokens.spacing.sm : 0;
  card.style.position = 'absolute';
  card.style.left = `${rect.x}px`;
  card.style.top = `${rect.y}px`;
  card.style.width = `${rect.width}px`;
  card.style.height = `${rect.height}px`;
  card.style.boxSizing = 'border-box';
  // When framed (e.g. inside a dashboard cell) the host already draws the card,
  // so render flat to avoid a doubled border/background.
  card.style.background = framed ? 'transparent' : tokens.color.surface;
  card.style.border = framed ? 'none' : `1px solid ${tokens.color.border}`;
  card.style.borderRadius = `${tokens.radius.lg}px`;
  card.style.padding = framed ? `0 0 ${sparkReserve}px` : `${pad}px ${pad}px ${pad + sparkReserve}px`;
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.justifyContent = 'center';
  card.style.alignItems = 'flex-start';
  card.style.gap = `${tokens.spacing.sm}px`;
  card.style.overflow = 'hidden';
  card.style.pointerEvents = 'none';
  return card;
}

function addText(card: HTMLDivElement, text: string, style: Partial<CSSStyleDeclaration>): HTMLDivElement {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, style);
  card.appendChild(el);
  return el;
}

function sparklineField(spec: KpiSpec): string | null {
  if (!spec.sparkline) return null;
  if (typeof spec.sparkline === 'object') return spec.sparkline.field;
  return valueField(spec.value);
}

function sparklineValues(data: readonly Datum[], field: string): number[] {
  const read = accessor(field);
  const values: number[] = [];
  for (const d of data) {
    const n = toNumber(read(d));
    if (!Number.isNaN(n) && Number.isFinite(n)) values.push(n);
  }
  return values;
}

function buildSparkline(
  tokens: ThemeTokens,
  width: number,
  height: number,
  values: readonly number[],
): SVGSVGElement | null {
  if (values.length === 0 || width <= 0 || height <= 0) return null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.display = 'block';
  svg.style.overflow = 'visible';

  const stroke = 1.75;
  const pad = stroke;
  const innerH = Math.max(1, height - pad * 2);
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const xAt = (i: number): number => (n === 1 ? width / 2 : (i / (n - 1)) * width);
  const yAt = (v: number): number => {
    const t = span === 0 ? 0.5 : (v - min) / span;
    return pad + (1 - t) * innerH;
  };

  if (n === 1) {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', String(width / 2));
    dot.setAttribute('cy', String(yAt(values[0] as number)));
    dot.setAttribute('r', '2.25');
    dot.setAttribute('fill', tokens.color.accent);
    svg.appendChild(dot);
    return svg;
  }

  let lineD = '';
  for (let i = 0; i < n; i++) {
    lineD += `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)} ${yAt(values[i] as number).toFixed(2)}`;
  }
  const areaD = `${lineD}L${width.toFixed(2)} ${height}L0 ${height}Z`;

  const gradId = `graphein-spark-${Math.random().toString(36).slice(2, 9)}`;
  const defs = document.createElementNS(SVG_NS, 'defs');
  const grad = document.createElementNS(SVG_NS, 'linearGradient');
  grad.setAttribute('id', gradId);
  grad.setAttribute('x1', '0');
  grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0');
  grad.setAttribute('y2', '1');
  const stopTop = document.createElementNS(SVG_NS, 'stop');
  stopTop.setAttribute('offset', '0');
  stopTop.setAttribute('stop-color', tokens.color.accent);
  stopTop.setAttribute('stop-opacity', '0.24');
  const stopBottom = document.createElementNS(SVG_NS, 'stop');
  stopBottom.setAttribute('offset', '1');
  stopBottom.setAttribute('stop-color', tokens.color.accent);
  stopBottom.setAttribute('stop-opacity', '0');
  grad.appendChild(stopTop);
  grad.appendChild(stopBottom);
  defs.appendChild(grad);
  svg.appendChild(defs);

  const area = document.createElementNS(SVG_NS, 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', `url(#${gradId})`);
  svg.appendChild(area);

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', lineD);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', tokens.color.accent);
  path.setAttribute('stroke-width', String(stroke));
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);

  return svg;
}

/** Hand-drawn sparkline: the same geometry rendered through the rough engine. */
function buildSparklineCanvas(
  tokens: ThemeTokens,
  width: number,
  height: number,
  values: readonly number[],
  sketch: ResolvedSketch,
): HTMLCanvasElement | null {
  if (values.length === 0 || width <= 0 || height <= 0) return null;

  const dpr = getDevicePixelRatio();
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(dpr, dpr);

  const stroke = 1.75;
  const pad = stroke;
  const innerH = Math.max(1, height - pad * 2);
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const xAt = (i: number): number => (n === 1 ? width / 2 : (i / (n - 1)) * width);
  const yAt = (v: number): number => pad + (1 - (span === 0 ? 0.5 : (v - min) / span)) * innerH;

  const pen = new RoughPen(ctx, sketch);
  if (n === 1) {
    pen.circle(width / 2, yAt(values[0] as number), 2.5, { fill: tokens.color.accent });
    return canvas;
  }
  const points: Point[] = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  pen.trendStroke(points, { stroke: tokens.color.accent, strokeWidth: stroke });
  return canvas;
}

export function drawKpi(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const kpi = spec as KpiSpec;
  if (surface.headless) {
    drawKpiCanvas(surface, kpi, tokens, size, context);
    return;
  }
  const data = kpi.data ?? [];
  const value = resolveValue(kpi.value, data);
  const delta = resolveValue(kpi.delta, data);
  const sparkField = sparklineField(kpi);
  const sparkValues = sparkField ? sparklineValues(data, sparkField) : [];
  const hasSparkline = sparkValues.length > 0;
  const sketch = resolveSketch(spec);
  const framed = context?.framed === true;
  const rect = cardRectFor(surface, tokens, size, kpi);
  const card = createCard(tokens, rect, hasSparkline, framed);
  if (sketch) card.style.borderRadius = SKETCH_BORDER_RADIUS;

  if (kpi.label) {
    addText(card, kpi.label, {
      color: tokens.color.textMuted,
      fontFamily: tokens.font.family,
      fontSize: `${tokens.font.size.base}px`,
      fontWeight: String(tokens.font.weight.medium),
      letterSpacing: '0.04em',
      lineHeight: '1.25',
      textTransform: 'uppercase',
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  }

  const valueText = value == null ? '—' : formatValue(value, kpi.format);
  const contentWidth = Math.max(1, rect.width - tokens.spacing.lg * 2);
  const sizeByCard = Math.min(rect.width, rect.height) * 0.22;
  const sizeByText = contentWidth / Math.max(1, valueText.length * 0.58);
  const valueSize = clamp(Math.min(sizeByCard, sizeByText), 28, 64);
  addText(card, valueText, {
    color: tokens.color.text,
    fontFamily: tokens.font.family,
    fontSize: `${valueSize}px`,
    fontWeight: String(tokens.font.weight.bold),
    letterSpacing: '-0.03em',
    lineHeight: '1.02',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });

  if (delta != null) {
    const positive = delta >= 0;
    addText(card, `${positive ? '▲' : '▼'} ${formatDelta(delta, kpi.format)}`, {
      color: positive ? tokens.color.positive : tokens.color.negative,
      fontFamily: tokens.font.family,
      fontSize: `${tokens.font.size.large}px`,
      fontWeight: String(tokens.font.weight.medium),
      lineHeight: '1',
      whiteSpace: 'nowrap',
    });
  }

  surface.overlay.appendChild(card);
  if (hasSparkline) {
    const pad = framed ? 0 : tokens.spacing.lg;
    const sparkH = clamp(rect.height * 0.18, 24, 40);
    const sparkW = Math.max(0, rect.width - pad * 2);
    const node = sketch
      ? buildSparklineCanvas(tokens, sparkW, sparkH, sparkValues, sketch)
      : buildSparkline(tokens, sparkW, sparkH, sparkValues);
    if (node) {
      node.style.position = 'absolute';
      node.style.left = `${pad}px`;
      node.style.bottom = `${pad}px`;
      card.appendChild(node);
    }
  }
}

/** Paint the KPI as canvas marks (headless, no DOM). Mirrors the DOM card layout. */
function drawKpiCanvas(
  surface: Surface,
  kpi: KpiSpec,
  tokens: ThemeTokens,
  size: Size,
  context?: RenderContext,
): void {
  const ctx = surface.marks.ctx;
  const data = kpi.data ?? [];
  const value = resolveValue(kpi.value, data);
  const delta = resolveValue(kpi.delta, data);
  const sparkField = sparklineField(kpi);
  const sparkValues = sparkField ? sparklineValues(data, sparkField) : [];
  const hasSparkline = sparkValues.length > 0;
  const framed = context?.framed === true;
  const rect = cardRectFor(surface, tokens, size, kpi);
  const pad = tokens.spacing.lg;
  const sparkReserve = hasSparkline ? Math.min(44, Math.max(28, rect.height * 0.18)) + tokens.spacing.sm : 0;

  if (!framed) {
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, tokens.radius.lg);
    ctx.fillStyle = tokens.color.surface;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = tokens.color.border;
    ctx.stroke();
    ctx.restore();
  }

  const left = rect.x + (framed ? 0 : pad);
  const contentWidth = Math.max(1, rect.width - (framed ? 0 : pad * 2));
  const valueText = value == null ? '—' : formatValue(value, kpi.format);
  const sizeByCard = Math.min(rect.width, rect.height) * 0.22;
  const sizeByText = contentWidth / Math.max(1, valueText.length * 0.58);
  const valueSize = clamp(Math.min(sizeByCard, sizeByText), 28, 64);
  const labelH = kpi.label ? tokens.font.size.base * 1.25 : 0;
  const deltaH = delta != null ? tokens.font.size.large : 0;
  const stackH = labelH + valueSize + deltaH + tokens.spacing.sm * 2;
  const avail = rect.height - sparkReserve;
  let y = rect.y + Math.max(framed ? 0 : pad, (avail - stackH) / 2);

  if (kpi.label) {
    paintCanvasText(ctx, {
      x: left,
      y,
      text: kpi.label.toUpperCase(),
      font: fontString(tokens.font.size.base, tokens.font.family, tokens.font.weight.medium),
      color: tokens.color.textMuted,
      size: tokens.font.size.base,
      baseline: 'top',
    });
    y += labelH + tokens.spacing.sm;
  }
  paintCanvasText(ctx, {
    x: left,
    y,
    text: valueText,
    font: fontString(valueSize, tokens.font.family, tokens.font.weight.bold),
    color: tokens.color.text,
    size: valueSize,
    baseline: 'top',
  });
  y += valueSize + tokens.spacing.sm;
  if (delta != null) {
    const positive = delta >= 0;
    paintCanvasText(ctx, {
      x: left,
      y,
      text: `${positive ? '▲' : '▼'} ${formatDelta(delta, kpi.format)}`,
      font: fontString(tokens.font.size.large, tokens.font.family, tokens.font.weight.medium),
      color: positive ? tokens.color.positive : tokens.color.negative,
      size: tokens.font.size.large,
      baseline: 'top',
    });
  }

  if (hasSparkline) {
    const sparkH = clamp(rect.height * 0.18, 24, 40);
    const inset = framed ? 0 : pad;
    const sparkW = Math.max(0, rect.width - inset * 2);
    const x0 = rect.x + inset;
    const y1 = rect.y + rect.height - inset;
    paintSparklineCanvas(ctx, tokens, x0, y1 - sparkH, sparkW, sparkH, sparkValues);
  }
}

/** Stroke a sparkline polyline onto the marks context within the given box. */
function paintSparklineCanvas(
  ctx: CanvasRenderingContext2D,
  tokens: ThemeTokens,
  x0: number,
  y0: number,
  width: number,
  height: number,
  values: readonly number[],
): void {
  if (values.length === 0 || width <= 0 || height <= 0) return;
  const stroke = 1.75;
  const pad = stroke;
  const innerH = Math.max(1, height - pad * 2);
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const xAt = (i: number): number => x0 + (n === 1 ? width / 2 : (i / (n - 1)) * width);
  const yAt = (v: number): number => y0 + pad + (1 - (span === 0 ? 0.5 : (v - min) / span)) * innerH;
  ctx.save();
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(xAt(0), yAt(values[0] as number), 2.25, 0, Math.PI * 2);
    ctx.fillStyle = tokens.color.accent;
    ctx.fill();
  } else {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = xAt(i);
      const py = yAt(values[i] as number);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = tokens.color.accent;
    ctx.lineWidth = stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}
