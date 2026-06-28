# graphein-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server for
[**Graphein**](https://github.com/spatney/graphein) — the agent-first data-visualization
library. It wraps Graphein's whole agent feedback loop (**validate → repair → render →
critique**) into one tool call, and serves Graphein's **schema and guides as resources**,
so a model that has never seen the API can still build correct charts at runtime.

> Graphein's real moat isn't the charts — it's that the library is self-describing,
> self-validating, and self-correcting. This server delivers all of that to any MCP
> client, turning "the model doesn't know Graphein" from a dealbreaker into a non-issue.

## Run it

No install needed — point your MCP client at `npx graphein-mcp`:

```jsonc
{
  "mcpServers": {
    "graphein": { "command": "npx", "args": ["-y", "graphein-mcp"] }
  }
}
```

That's the standard shape for Claude Desktop, Copilot, Cursor, and friends. The server
speaks MCP over **stdio**.

Or install it:

```bash
npm install -g graphein-mcp   # then: graphein-mcp
```

## Tools

| Tool | What it does |
| --- | --- |
| **`render_chart`** | The one-call loop. Validates a `ChartSpec`, auto-repairs safe mistakes, renders a PNG, and returns the **image** plus a **vision-free critique** (render report + lint warnings + repairs applied). If the spec can't be made valid, returns structured errors with JSON-Patch fixes instead of an image. |
| **`validate_chart`** | Validate without rendering. Returns structural errors (each with a JSON-Patch `fix` when unambiguous, plus "did you mean" suggestions) and best-practice lint warnings. |
| **`repair_chart`** | Apply every safe, unambiguous fix and return the corrected spec, the patch ops applied, and whether it's now valid. |
| **`summarize_chart`** | Deterministic, plain-English description of what the data shows (doubles as alt-text; no LLM). |

`render_chart` accepts `spec` plus optional `width`, `height`, `dpr`, and `repair`
(default `true`). DOM-only visuals (`kpi`, `table`, `matrix`, slicers, `dashboard`)
validate but have no headless image — the tool says so rather than failing.

### Example result

Calling `render_chart` with a valid line spec returns an `image` block and a `text` block:

```json
{
  "ok": true,
  "rendered": true,
  "type": "line",
  "pixelSize": { "width": 800, "height": 500 },
  "summary": "Users rose 43% from 4200 to 6010 between 2024-01 and 2024-03.",
  "marks": 3, "series": 1, "colors": 1,
  "diagnostics": [],
  "lint": [],
  "repairsApplied": []
}
```

## Resources

The server delivers Graphein's API knowledge at runtime — read these instead of relying
on training data:

| URI | Contents |
| --- | --- |
| `graphein://agent-guide` | Task-oriented guide: the workflow, choosing a chart type, the loop, recipes. **Read this first.** |
| `graphein://schema` | The machine-readable JSON Schema for every `ChartSpec` / `DashboardSpec` field. |
| `graphein://spec-reference` | The exhaustive field-by-field reference. |

## Prompt

`create_chart` — primes the workflow from a `goal` (and optional `data`): read the
guide, shape tidy data, emit a spec, render, and apply fixes instead of regenerating.

## Embed it

The server is also a library, so you can mount it on any transport:

```ts
import { createServer } from 'graphein-mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = createServer();
await server.connect(new StdioServerTransport());
```

The individual tool handlers (`renderChartHandler`, `validateChartHandler`,
`repairChartHandler`, `summarizeChartHandler`) are exported as pure functions too.

## How it works

`graphein-mcp` is a thin wrapper over [`graphein`](https://github.com/spatney/graphein)
(validation, repair, lint, deterministic summaries) and
[`@graphein/node`](https://github.com/spatney/graphein/tree/main/packages/node) (headless
PNG rendering via `@napi-rs/canvas`). The core engine stays dependency-free; this package
owns the MCP plumbing.

## License

MIT
