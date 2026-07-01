#!/usr/bin/env node
/**
 * Example: drive the Graphein MCP server from a plain MCP stdio client.
 *
 * It turns a CSV of raw sales records into a rendered "sales by region" bar-chart
 * PNG by calling the server's `render_chart` tool — the same generate → validate →
 * repair → render → critique loop any MCP-capable model would use.
 *
 *   1. Shape the data     — parse the CSV, aggregate Total Revenue per Region.
 *   2. Describe the chart — one Graphein ChartSpec ({ type, data, encoding, title }).
 *   3. Connect to the MCP — spawn ../dist/server.js over stdio, call render_chart.
 *   4. Save + critique    — write the PNG, print the vision-free RenderReport.
 *
 * Usage:
 *   node packages/mcp/examples/sales-by-region.mjs [input.csv] [output.png]
 *
 * Defaults render the bundled "5000 Sales Records.csv" next to it as a PNG.
 * (Build the server first: `npm run build --workspace graphein-mcp`.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = resolve(here, '../dist/server.js');

const INPUT =
  process.argv[2] ??
  'C:/Users/sachi/iCloudDrive/Documents/Test files/csv/5000 Sales Records.csv';
const OUTPUT = process.argv[3] ?? resolve(dirname(INPUT), 'sales-by-region.png');

// --- 1. Shape the data -------------------------------------------------------

/** Split one CSV line, honoring "quoted, fields" and "" escapes. */
function splitRow(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}

const rows = parseCsv(readFileSync(INPUT, 'utf8'));

// One row per bar: Total Revenue summed per Region (cartesian charts plot rows
// as-is, so we pre-aggregate). Sort descending so the biggest region leads.
const totals = new Map();
for (const row of rows) {
  const region = row['Region'];
  const revenue = Number(row['Total Revenue']);
  if (!region || !Number.isFinite(revenue)) continue;
  totals.set(region, (totals.get(region) ?? 0) + revenue);
}
const data = [...totals.entries()]
  .map(([region, revenue]) => ({ region, revenue: Math.round(revenue) }))
  .sort((a, b) => b.revenue - a.revenue);

// --- 2. Describe the chart as one Graphein ChartSpec -------------------------

const spec = {
  type: 'bar',
  data,
  encoding: {
    x: { field: 'region', type: 'nominal' },
    y: { field: 'revenue', type: 'quantitative' },
  },
  title: 'Total sales by region',
};

// --- 3. Connect to the Graphein MCP server and render ------------------------

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [SERVER],
});
const client = new Client({ name: 'sales-by-region-example', version: '1.0.0' });
await client.connect(transport);

const result = await client.callTool({
  name: 'render_chart',
  arguments: { spec, width: 1000, height: 560 },
});

// --- 4. Save the PNG and print the vision-free critique ----------------------

const image = result.content.find((c) => c.type === 'image');
const critique = result.content.find((c) => c.type === 'text');

if (image) {
  writeFileSync(OUTPUT, Buffer.from(image.data, 'base64'));
  console.log(`Rendered ${data.length} regions → ${OUTPUT}`);
} else {
  console.error('render_chart returned no image:');
}
if (critique) console.log(critique.text);

await client.close();
