/**
 * `createServer()` — builds the Graphein MCP server: the generate → validate →
 * repair → render → critique loop as four tools, the schema + guides as resources,
 * and a `create_chart` prompt that teaches the workflow. Split from the stdio
 * entry point (`server.ts`) so it can be driven over any transport — including the
 * in-memory transport in tests.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  renderChartHandler,
  validateChartHandler,
  repairChartHandler,
  summarizeChartHandler,
} from './handlers.js';
import { RESOURCES, readResourceFile } from './resources.js';

/** Package version, surfaced as the MCP server version. */
export const VERSION = '0.3.0';

const SERVER_INSTRUCTIONS = `Graphein is an agent-first data-visualization library: you describe a chart as one JSON ChartSpec ({ type, data, encoding, ... }) and it renders. This server lets you build correct charts without prior knowledge of the API.

Workflow:
1. Read the graphein://agent-guide resource (and graphein://schema for exact fields) if you are unsure of the API.
2. Shape your data as a tidy array — one row per observation, one column per variable.
3. Emit a ChartSpec and call render_chart: it validates, auto-repairs safe mistakes, renders a PNG, and returns a vision-free critique (the render report + lint warnings). Read the critique to verify the chart looks right.
4. If a spec is invalid, render_chart (and validate_chart) return structured errors each with a JSON-Patch 'fix' — apply it (or call repair_chart) and retry instead of regenerating.
Use summarize_chart for deterministic alt-text. Every type rasterizes headlessly, including kpi, table, matrix, slicers and dashboard (static canvas snapshots).`;

/** A permissive object schema for a Graphein spec — validateSpec does the real checking. */
const specSchema = z
  .record(z.string(), z.unknown())
  .describe(
    'A Graphein ChartSpec or DashboardSpec object, e.g. { "type": "line", "data": [...], "encoding": {...} }. See the graphein://schema and graphein://agent-guide resources.',
  );

/**
 * Build a fully-configured Graphein MCP server. The caller connects it to a
 * transport (`server.connect(transport)`).
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'graphein-mcp', version: VERSION },
    { instructions: SERVER_INSTRUCTIONS },
  );

  // --- Tools: the runtime loop -------------------------------------------------

  server.registerTool(
    'render_chart',
    {
      title: 'Render a Graphein chart',
      description:
        'The one-call loop: validate a ChartSpec, auto-repair safe mistakes, render it to a PNG, and return the image plus a vision-free critique (render report, lint warnings, repairs applied). If the spec cannot be made valid, returns structured errors with JSON-Patch fixes instead of an image. Every type rasterizes headlessly — kpi, table, matrix, slicers and dashboard render static canvas snapshots.',
      inputSchema: {
        spec: specSchema,
        width: z.number().int().positive().optional().describe('Logical width in CSS px (default 800).'),
        height: z.number().int().positive().optional().describe('Logical height in CSS px (default 500).'),
        dpr: z.number().positive().optional().describe('Device pixel ratio for crisp output (default 2).'),
        repair: z
          .boolean()
          .optional()
          .describe('Auto-apply safe repairs before rendering when the spec is invalid (default true).'),
      },
    },
    async (args) => renderChartHandler(args),
  );

  server.registerTool(
    'validate_chart',
    {
      title: 'Validate a Graphein chart spec',
      description:
        'Validate a ChartSpec without rendering. Returns structural errors (each with a JSON-Patch `fix` when unambiguous, plus "did you mean" suggestions) and best-practice lint warnings. Fast feedback before rendering.',
      inputSchema: { spec: specSchema },
    },
    async (args) => validateChartHandler(args),
  );

  server.registerTool(
    'repair_chart',
    {
      title: 'Repair a Graphein chart spec',
      description:
        'Apply every safe, unambiguous fix Graphein proposes (misspelled chart type or enum, a temporal field typed as a category, …) and return the corrected spec, the JSON Patch ops applied, and whether it is now valid. Turns a near-miss into a one-step correction.',
      inputSchema: { spec: specSchema },
    },
    async (args) => repairChartHandler(args),
  );

  server.registerTool(
    'summarize_chart',
    {
      title: 'Summarize a Graphein chart',
      description:
        'Return a deterministic, plain-English description of what the chart\'s data shows (e.g. "Users grew 46% over six months, peaking in June"). Doubles as alt-text; needs no LLM.',
      inputSchema: { spec: specSchema },
    },
    async (args) => summarizeChartHandler(args),
  );

  // --- Resources: deliver the API knowledge at runtime -------------------------

  for (const r of RESOURCES) {
    server.registerResource(
      r.name,
      r.uri,
      { title: r.title, description: r.description, mimeType: r.mimeType },
      async (uri) => ({
        contents: [{ uri: uri.href, mimeType: r.mimeType, text: readResourceFile(r.file) }],
      }),
    );
  }

  // --- Prompt: teach the workflow ---------------------------------------------

  server.registerPrompt(
    'create_chart',
    {
      title: 'Create a Graphein chart',
      description:
        'Scaffold the workflow for building a validated Graphein chart from a goal (and optional data).',
      argsSchema: {
        goal: z.string().describe('What the chart should show, e.g. "monthly active users over the last year".'),
        data: z
          .string()
          .optional()
          .describe('Optional: the data as a JSON array, or a description of the columns available.'),
      },
    },
    ({ goal, data }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Build a Graphein chart for this goal:\n\n${goal}\n${
              data ? `\nData:\n${data}\n` : ''
            }\nSteps:\n1. If unsure of the API, read the graphein://agent-guide resource (and graphein://schema for exact fields).\n2. Shape the data as a tidy array — one row per observation, one column per variable.\n3. Choose a chart type and write a single ChartSpec ({ type, data, encoding, title }).\n4. Call render_chart with the spec. Read the returned critique (render report + lint) to confirm it looks right.\n5. If it reports errors, apply each error.fix patch (or call repair_chart) and render again — do not regenerate from scratch.`,
          },
        },
      ],
    }),
  );

  return server;
}
