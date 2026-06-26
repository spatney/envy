// Projects the raw lat/lon US states GeoJSON through the Albers USA composite
// projection into a planar (screen-space) GeoJSON, so the gallery can render a
// clean, iconic US choropleth via `projection: 'identity'` (Alaska + Hawaii are
// composited as insets). Run with: npm run build:map
//
// Input:  src/us-states.geo.json   (GeoJSON in [lon, lat])
// Output: src/us-states.albers.json (GeoJSON in planar [x, y], y-down)
import { geoAlbersUsa } from 'd3-geo';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const srcPath = process.argv[2]
  ? new URL(process.argv[2], `file://${process.cwd()}/`)
  : new URL('../src/us-states.geo.json', import.meta.url);
const outPath = process.argv[3]
  ? new URL(process.argv[3], `file://${process.cwd()}/`)
  : new URL('../src/us-states.albers.json', import.meta.url);

const fc = JSON.parse(readFileSync(srcPath, 'utf8'));

// Project into a tidy box; the renderer re-fits to its draw rect anyway.
const proj = geoAlbersUsa().fitExtent(
  [
    [0, 0],
    [1000, 600],
  ],
  fc,
);

const r = (n) => Math.round(n * 10) / 10;

function projectRing(ring) {
  const out = [];
  for (const pos of ring) {
    const p = proj(pos);
    if (!p) continue; // outside the Albers USA clip (e.g. Puerto Rico)
    out.push([r(p[0]), r(p[1])]);
  }
  return out.length >= 4 ? out : null;
}

function projectPolygon(rings) {
  const out = [];
  for (const ring of rings) {
    const pr = projectRing(ring);
    if (pr) out.push(pr);
  }
  return out.length ? out : null;
}

let dropped = 0;
const features = fc.features.map((f) => {
  const g = f.geometry;
  let geometry = null;
  if (g && g.type === 'Polygon') {
    const p = projectPolygon(g.coordinates);
    if (p) geometry = { type: 'Polygon', coordinates: p };
  } else if (g && g.type === 'MultiPolygon') {
    const polys = [];
    for (const poly of g.coordinates) {
      const p = projectPolygon(poly);
      if (p) polys.push(p);
    }
    if (polys.length) geometry = { type: 'MultiPolygon', coordinates: polys };
  }
  if (!geometry) dropped += 1;
  return { type: 'Feature', properties: f.properties, geometry };
});

writeFileSync(outPath, JSON.stringify({ type: 'FeatureCollection', features }));
const bytes = readFileSync(outPath).length;
console.log(
  `wrote ${fileURLToPath(outPath)} (${(bytes / 1024).toFixed(0)} KB), ` +
    `features=${features.length}, dropped=${dropped}`,
);
