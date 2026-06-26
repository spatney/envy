import { rgbaToCss, sequential, sequentialColorScale, withAlpha } from '../color';
import { formatValue } from '../format';
import type { Surface } from '../render/surface';
import type {
  ChartSpec,
  ChoroplethSpec,
  GeoFeature,
  GeoPosition,
  MapProjection,
} from '../spec/types';
import type { ThemeTokens } from '../theme';
import type { Rect, Size } from '../types';
import { accessor, toKey, toNumber } from '../util/data';
import type { InteractionModel } from '../interaction/types';
import { addOverlayText, drawTitleBlock } from './chrome';

type Ring = GeoPosition[];

interface ProjectedFeature {
  key: string;
  name: string;
  value: number | null;
  /** Polygons in projected (pre-fit) space; each polygon is a list of rings. */
  polys: Ring[][];
}

interface ScreenFeature {
  key: string;
  name: string;
  value: number | null;
  color: string;
  /** Polygons in screen space; each polygon is a list of rings of [x, y]. */
  polys: number[][][][];
  cx: number;
  cy: number;
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Pick a central meridian so geometry that straddles the ±180° antimeridian
 * (e.g. Alaska's Aleutian islands) doesn't blow the longitude span out to ~360°.
 * We find the widest empty longitude gap and center the map on its antipode.
 */
function centralMeridian(features: GeoFeature[]): number {
  const lons: number[] = [];
  for (const feature of features) {
    for (const polygon of polygonsOf(feature)) {
      for (const ring of polygon) {
        for (const pos of ring) {
          if (Number.isFinite(pos[0])) lons.push(pos[0]);
        }
      }
    }
  }
  if (lons.length === 0) return 0;
  lons.sort((a, b) => a - b);
  // Widest gap, including the wrap-around from the last point back to the first.
  let gapStart = lons[lons.length - 1];
  let gapEnd = lons[0] + 360;
  let maxGap = gapEnd - gapStart;
  for (let i = 1; i < lons.length; i += 1) {
    const g = lons[i] - lons[i - 1];
    if (g > maxGap) {
      maxGap = g;
      gapStart = lons[i - 1];
      gapEnd = lons[i];
    }
  }
  // Data is centered opposite the empty gap.
  return (gapStart + gapEnd) / 2 + 180;
}

function projector(kind: MapProjection, lon0: number): (pos: GeoPosition) => [number, number] {
  if (kind === 'identity') {
    return ([x, y]) => [x, y];
  }
  const wrapLon = (lon: number): number => {
    let d = lon - lon0;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return lon0 + d;
  };
  if (kind === 'equirectangular') {
    return ([lon, lat]) => [wrapLon(lon), lat];
  }
  // Web Mercator (north-up); latitude clamped to the standard cutoff.
  return ([lon, lat]) => {
    const phi = (clamp(lat, -85.0511, 85.0511) * Math.PI) / 180;
    return [wrapLon(lon), (Math.log(Math.tan(Math.PI / 4 + phi / 2)) * 180) / Math.PI];
  };
}

function featureKey(feature: GeoFeature, featureId: string | undefined): string {
  if (featureId) {
    if (featureId === 'id' && feature.id != null) return toKey(feature.id);
    const v = feature.properties?.[featureId];
    if (v != null) return toKey(v);
  }
  if (feature.id != null) return toKey(feature.id);
  const props = feature.properties ?? {};
  if (props.id != null) return toKey(props.id);
  if (props.name != null) return toKey(props.name);
  return '';
}

function featureName(feature: GeoFeature, key: string): string {
  const props = feature.properties ?? {};
  if (typeof props.name === 'string') return props.name;
  return key;
}

function polygonsOf(feature: GeoFeature): Ring[][] {
  const geom = feature.geometry;
  if (!geom) return [];
  if (geom.type === 'Polygon') return [geom.coordinates];
  if (geom.type === 'MultiPolygon') return geom.coordinates;
  return [];
}

function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function drawLegend(
  surface: Surface,
  tokens: ThemeTokens,
  legend: Rect,
  domain: [number, number],
  scheme: string,
  format: string | undefined,
): void {
  if (legend.width <= 0 || legend.height <= 0) return;
  const ctx = surface.marks.ctx;
  const interp = sequential(scheme);
  const barWidth = Math.floor(clamp(legend.width * 0.5, 120, 240));
  const barHeight = 10;
  const barX = Math.round(legend.x + (legend.width - barWidth) / 2);
  const barY = Math.round(legend.y + 4);
  const same = domain[0] === domain[1];
  for (let i = 0; i < barWidth; i += 1) {
    const t = same ? 0.5 : i / (barWidth - 1);
    ctx.fillStyle = rgbaToCss(interp(t));
    ctx.fillRect(barX + i, barY, 1, barHeight);
  }
  ctx.strokeStyle = tokens.color.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(barX + 0.5, barY + 0.5, Math.max(0, barWidth - 1), Math.max(0, barHeight - 1));
  const labelTop = barY + barHeight + 3;
  addOverlayText(surface, tokens, {
    left: barX,
    top: labelTop,
    text: formatValue(domain[0], format),
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
  });
  addOverlayText(surface, tokens, {
    left: barX + barWidth,
    top: labelTop,
    text: formatValue(domain[1], format),
    color: tokens.color.textMuted,
    size: tokens.font.size.small,
    transform: 'translateX(-100%)',
  });
}

export function drawChoropleth(
  surface: Surface,
  spec: ChartSpec,
  tokens: ThemeTokens,
  size: Size,
): InteractionModel | void {
  const choropleth = spec as ChoroplethSpec;
  const content = drawTitleBlock(surface, tokens, size, choropleth.title);
  const features = choropleth.geo?.features ?? [];
  if (features.length === 0 || content.width <= 0 || content.height <= 0) return;

  // Join data rows to features by key.
  const readKey = accessor(choropleth.encoding.key.field);
  const readColor = accessor(choropleth.encoding.color.field);
  const valueByKey = new Map<string, number>();
  for (const row of choropleth.data ?? []) {
    const k = toKey(readKey(row));
    const v = toNumber(readColor(row));
    if (k !== '' && Number.isFinite(v)) valueByKey.set(k, v);
  }

  const projection = choropleth.projection ?? 'mercator';
  const project = projector(
    projection,
    projection === 'identity' ? 0 : centralMeridian(features),
  );
  const flipY = projection !== 'identity';
  const projected: ProjectedFeature[] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;

  for (const feature of features) {
    const key = featureKey(feature, choropleth.featureId);
    const value = valueByKey.has(key) ? valueByKey.get(key)! : null;
    if (value != null) {
      if (value < vMin) vMin = value;
      if (value > vMax) vMax = value;
    }
    const polys: Ring[][] = [];
    for (const polygon of polygonsOf(feature)) {
      const rings: Ring[] = [];
      for (const ring of polygon) {
        const pr: Ring = [];
        for (const pos of ring) {
          const [x, y] = project(pos);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          pr.push([x, y]);
        }
        if (pr.length >= 3) rings.push(pr);
      }
      if (rings.length) polys.push(rings);
    }
    projected.push({ key, name: featureName(feature, key), value, polys });
  }

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  if (!(spanX > 0) || !(spanY > 0)) return;

  const labelSize = tokens.font.size.small;
  const legendHeight = vMax >= vMin ? Math.ceil(labelSize + 26) : 0;
  const mapRect: Rect = {
    x: content.x,
    y: content.y,
    width: content.width,
    height: Math.max(10, content.height - legendHeight),
  };

  const scale = Math.min(mapRect.width / spanX, mapRect.height / spanY);
  const drawW = spanX * scale;
  const drawH = spanY * scale;
  const offsetX = mapRect.x + (mapRect.width - drawW) / 2;
  const offsetY = mapRect.y + (mapRect.height - drawH) / 2;
  const sx = (x: number): number => offsetX + (x - minX) * scale;
  const sy = (y: number): number =>
    flipY ? offsetY + (maxY - y) * scale : offsetY + (y - minY) * scale;

  const hasValues = vMax >= vMin;
  const domain: [number, number] = hasValues ? [vMin, vMax] : [0, 1];
  const cscale = sequentialColorScale({
    domain,
    interpolator: sequential(choropleth.scheme ?? 'teal'),
  });
  const noDataFill = withAlpha(tokens.color.textMuted, 0.14);

  const screen: ScreenFeature[] = projected.map((pf) => {
    let cx = 0;
    let cy = 0;
    let count = 0;
    const polys = pf.polys.map((polygon) =>
      polygon.map((ring) =>
        ring.map(([x, y]) => {
          const px = sx(x);
          const py = sy(y);
          cx += px;
          cy += py;
          count += 1;
          return [px, py];
        }),
      ),
    );
    return {
      key: pf.key,
      name: pf.name,
      value: pf.value,
      color: pf.value == null ? noDataFill : rgbaToCss(cscale.map(pf.value)),
      polys,
      cx: count ? cx / count : 0,
      cy: count ? cy / count : 0,
    };
  });

  const ctx = surface.marks.ctx;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = tokens.color.background;
  ctx.lineWidth = 0.75;
  for (const f of screen) {
    ctx.fillStyle = f.color;
    for (const polygon of f.polys) {
      ctx.beginPath();
      for (const ring of polygon) {
        ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }
  }
  ctx.restore();

  if (legendHeight > 0) {
    drawLegend(
      surface,
      tokens,
      { x: content.x, y: mapRect.y + mapRect.height + 4, width: content.width, height: legendHeight },
      domain,
      choropleth.scheme ?? 'teal',
      choropleth.encoding.color.format,
    );
  }

  const tt = choropleth.tooltip;
  if (tt === false || (tt && typeof tt === 'object' && tt.show === false)) return;

  const colorLabel = choropleth.encoding.color.title ?? choropleth.encoding.color.field;
  return {
    region: mapRect,
    hitTest: (px, py) => {
      for (const f of screen) {
        let inside = false;
        for (const polygon of f.polys) {
          if (polygon.length && pointInRing(px, py, polygon[0])) {
            inside = true;
            for (let i = 1; i < polygon.length; i += 1) {
              if (pointInRing(px, py, polygon[i])) inside = false;
            }
            if (inside) break;
          }
        }
        if (!inside) continue;
        return {
          key: f.key,
          anchorX: px,
          anchorY: py,
          content: {
            title: f.name,
            rows: [
              {
                swatch: f.color,
                label: colorLabel,
                value: f.value == null ? 'no data' : formatValue(f.value, choropleth.encoding.color.format),
              },
            ],
          },
          draw: (ictx) => {
            ictx.save();
            ictx.lineJoin = 'round';
            ictx.strokeStyle = tokens.color.text;
            ictx.lineWidth = 1.5;
            for (const polygon of f.polys) {
              ictx.beginPath();
              for (const ring of polygon) {
                ring.forEach(([x, y], i) => (i === 0 ? ictx.moveTo(x, y) : ictx.lineTo(x, y)));
                ictx.closePath();
              }
              ictx.stroke();
            }
            ictx.restore();
          },
        };
      }
      return null;
    },
  };
}
