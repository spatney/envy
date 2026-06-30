/**
 * Pure tool handlers — the generate → validate → repair → render → critique loop
 * exposed as plain functions so they can be unit-tested without a transport. Each
 * returns MCP-shaped content (`text` and/or `image` blocks). `createServer` wires
 * these into the `McpServer`.
 *
 * The handlers wrap `graphein`'s self-validating / self-repairing / self-explaining
 * core (`validateSpec`, `repairSpec`, `summarize`) and `@graphein/node`'s headless
 * `renderChart`, so an agent gets the chart **plus** a vision-free critique in one
 * call — and a one-step repair when its spec is slightly wrong.
 */
import {
  validateSpec,
  repairSpec,
  recommendChart,
  summarize,
  type ChartSpec,
  type RecommendOptions,
  type ValidationError,
} from 'graphein';
import { renderChart } from '@graphein/node';
import type { JsonPatchOp } from './types.js';

/** A subset of MCP content blocks the handlers emit. */
export type McpContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

/**
 * The shape every handler returns — assignable to the SDK's `CallToolResult`
 * (which is an open/passthrough type, hence the index signature).
 */
export interface ToolResult {
  content: McpContent[];
  isError?: boolean;
  [key: string]: unknown;
}

/** Options accepted by {@link renderChartHandler}. */
export interface RenderArgs {
  spec: unknown;
  width?: number;
  height?: number;
  dpr?: number;
  /** Auto-apply safe repairs before rendering when the spec is invalid. Default true. */
  repair?: boolean;
}

export interface RecommendChartArgs {
  data: Record<string, unknown>[];
  intent?: string;
  maxResults?: number;
}

function text(value: string): McpContent {
  return { type: 'text', text: value };
}

function json(value: unknown): McpContent {
  return text(JSON.stringify(value, null, 2));
}

function specType(spec: unknown): string {
  return typeof spec === 'object' && spec !== null && 'type' in spec
    ? String((spec as { type: unknown }).type)
    : '(missing)';
}

function isRecommendIntent(value: string | undefined): value is RecommendOptions['intent'] {
  return (
    value === undefined ||
    value === 'trend' ||
    value === 'comparison' ||
    value === 'distribution' ||
    value === 'relationship' ||
    value === 'composition'
  );
}

/** Slim a validation error for an agent payload (drops nothing useful). */
function tidyError(e: ValidationError) {
  const out: Record<string, unknown> = { path: e.path, message: e.message };
  if (e.rule) out.rule = e.rule;
  if (e.severity) out.severity = e.severity;
  if (e.fix) out.fix = e.fix;
  if (e.suggestion) out.suggestion = e.suggestion;
  return out;
}

/**
 * **The flagship.** Validate a spec, auto-repair it if it's safely fixable, render
 * it to a PNG headless, and return the image alongside a machine-readable critique
 * (the render report + lint warnings + any repairs applied). When the spec can't be
 * made valid, returns the structured errors and JSON-Patch fixes instead of an image
 * so the agent corrects in one step rather than regenerating.
 */
export function renderChartHandler(args: RenderArgs): ToolResult {
  const { spec, width, height, dpr, repair = true } = args;

  let working: unknown = spec;
  let validation = validateSpec(working);
  let repairs: JsonPatchOp[] = [];

  if (!validation.valid && repair) {
    const repaired = repairSpec(working);
    if (repaired.applied.length > 0) {
      working = repaired.spec;
      repairs = repaired.applied;
      validation = validateSpec(working);
    }
  }

  if (!validation.valid) {
    return {
      isError: true,
      content: [
        json({
          ok: false,
          rendered: false,
          stage: 'validate',
          type: specType(working),
          errors: validation.errors.map(tidyError),
          lint: validation.warnings.map(tidyError),
          repairsApplied: repairs,
          hint: 'Apply each error.fix JSON Patch (or the repair_chart tool), then call render_chart again. See the graphein://agent-guide and graphein://schema resources.',
        }),
      ],
    };
  }

  const type = specType(working);

  try {
    const { png, report, width: pxW, height: pxH } = renderChart(working as ChartSpec, {
      width,
      height,
      dpr,
    });
    return {
      isError: false,
      content: [
        { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
        json({
          ok: report.ok,
          rendered: true,
          type,
          pixelSize: { width: pxW, height: pxH },
          summary: report.summary,
          marks: report.markCount,
          series: report.seriesCount,
          colors: report.colorCount,
          diagnostics: report.diagnostics,
          lint: validation.warnings.map(tidyError),
          repairsApplied: repairs,
        }),
      ],
    };
  } catch (e) {
    return {
      isError: true,
      content: [
        json({
          ok: false,
          rendered: false,
          stage: 'render',
          type,
          message: e instanceof Error ? e.message : String(e),
          summary: summarize(working as ChartSpec) || undefined,
          repairsApplied: repairs,
        }),
      ],
    };
  }
}

/**
 * Validate a spec without rendering — fast structural + best-practice feedback.
 * Returns errors (each with a JSON-Patch `fix` when unambiguous and "did you mean"
 * suggestions) and lint `warnings`.
 */
export function validateChartHandler(args: { spec: unknown }): ToolResult {
  const result = validateSpec(args.spec);
  return {
    isError: false,
    content: [
      json({
        valid: result.valid,
        type: specType(args.spec),
        errors: result.errors.map(tidyError),
        warnings: result.warnings.map(tidyError),
      }),
    ],
  };
}

/** Recommend ready-to-render ChartSpecs from tidy rows and an optional intent. */
export function recommendChartHandler(args: RecommendChartArgs): ToolResult {
  if (!isRecommendIntent(args.intent)) {
    return {
      isError: true,
      content: [
        json({
          ok: false,
          message: 'Unsupported intent. Expected trend, comparison, distribution, relationship, or composition.',
        }),
      ],
    };
  }
  return {
    isError: false,
    content: [
      json({
        ok: true,
        recommendations: recommendChart(args.data, { intent: args.intent, maxResults: args.maxResults }),
      }),
    ],
  };
}

/**
 * Apply every safe, unambiguous repair Graphein proposes and return the corrected
 * spec, the JSON Patch operations applied, and whether it is now valid.
 */
export function repairChartHandler(args: { spec: unknown }): ToolResult {
  const { spec, applied, remaining } = repairSpec(args.spec);
  return {
    isError: false,
    content: [
      json({
        valid: remaining.length === 0,
        applied,
        remaining: remaining.map(tidyError),
        spec,
      }),
    ],
  };
}

/**
 * Return a deterministic, plain-English summary of what the chart's data shows —
 * doubles as alt-text, needs no LLM.
 */
export function summarizeChartHandler(args: { spec: unknown }): ToolResult {
  const result = validateSpec(args.spec);
  if (!result.valid) {
    return {
      isError: true,
      content: [
        json({
          summary: null,
          reason: 'Spec is invalid; fix it first (validate_chart / repair_chart).',
          errors: result.errors.map(tidyError),
        }),
      ],
    };
  }
  const summary = summarize(args.spec as ChartSpec);
  return {
    isError: false,
    content: [
      text(summary || `(No narrative summary is available for a '${specType(args.spec)}' chart.)`),
    ],
  };
}
