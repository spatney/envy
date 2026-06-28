/**
 * Public types re-exported from `graphein` for convenience, so consumers of
 * `graphein-mcp` (and the handlers here) have one import site for the spec and
 * critique shapes the tools speak in.
 */
export type {
  ChartSpec,
  DashboardSpec,
  AnySpec,
  ValidationError,
  ValidationResult,
  JsonPatchOp,
  RenderReport,
} from 'graphein';
