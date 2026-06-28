/**
 * `graphein-mcp` — a Model Context Protocol server for Graphein.
 *
 * Exposes the agent feedback loop (validate → repair → render → critique) as MCP
 * tools and serves Graphein's schema + guides as resources, so a model that has
 * never seen Graphein's API can still produce correct charts at runtime. Run the
 * stdio server via the `graphein-mcp` bin, or embed it with {@link createServer}.
 */
export { createServer, VERSION } from './create-server.js';
export {
  renderChartHandler,
  validateChartHandler,
  repairChartHandler,
  summarizeChartHandler,
  type ToolResult,
  type McpContent,
  type RenderArgs,
} from './handlers.js';
export {
  RESOURCES,
  readResourceFile,
  resourceByUri,
  type GrapheinResource,
} from './resources.js';
export type {
  ChartSpec,
  DashboardSpec,
  AnySpec,
  ValidationError,
  ValidationResult,
  JsonPatchOp,
  RenderReport,
} from './types.js';
