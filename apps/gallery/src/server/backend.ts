/**
 * Graphein gallery dev/preview backend — a tiny Vite middleware that makes the
 * SSR and MCP demos *genuinely live*:
 *
 *   POST /api/ssr                      → real @graphein/node headless PNG + report
 *   POST /api/mcp/render|validate|     → the real graphein-mcp tool handlers
 *            repair|summarize
 *   GET  /api/mcp/resources/:name      → the real served MCP resources
 *
 * Native canvas (@graphein/node) and the MCP handlers are loaded lazily on first
 * request so dev-server startup stays instant. Used by both `configureServer`
 * (dev) and `configurePreviewServer` (preview); a static build without this
 * middleware degrades gracefully (the pages detect the missing endpoint).
 */
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Req = IncomingMessage & { url?: string; method?: string };
type Res = ServerResponse;
type Next = (err?: unknown) => void;

function readJson(req: Req): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: Res, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(payload);
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function handleSsr(body: Record<string, unknown>): Promise<unknown> {
  const { renderChart } = await import('@graphein/node');
  const spec = body.spec;
  const width = typeof body.width === 'number' ? body.width : 820;
  const height = typeof body.height === 'number' ? body.height : 460;
  const dpr = typeof body.dpr === 'number' ? body.dpr : 2;
  const started = performance.now();
  try {
    const out = renderChart(spec as never, { width, height, dpr });
    return {
      ok: true,
      pngBase64: Buffer.from(out.png).toString('base64'),
      report: out.report,
      width: out.width,
      height: out.height,
      dpr,
      ms: Math.round((performance.now() - started) * 10) / 10,
    };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

type McpTool = 'render' | 'validate' | 'repair' | 'summarize';

async function handleMcp(tool: McpTool, body: Record<string, unknown>): Promise<unknown> {
  const mcp = await import('graphein-mcp');
  switch (tool) {
    case 'render':
      return mcp.renderChartHandler(body as never);
    case 'validate':
      return mcp.validateChartHandler(body as never);
    case 'repair':
      return mcp.repairChartHandler(body as never);
    case 'summarize':
      return mcp.summarizeChartHandler(body as never);
  }
}

async function handleResource(name: string): Promise<unknown> {
  const mcp = await import('graphein-mcp');
  const resource = mcp.RESOURCES.find((r) => r.name === name);
  if (!resource) return { ok: false, error: `Unknown resource: ${name}` };
  return {
    ok: true,
    name: resource.name,
    uri: resource.uri,
    title: resource.title,
    description: resource.description,
    mimeType: resource.mimeType,
    text: mcp.readResourceFile(resource.file),
  };
}

async function dispatch(req: Req, res: Res, next: Next): Promise<void> {
  const url = (req.url ?? '').split('?')[0];
  if (!url.startsWith('/api/')) return next();

  try {
    if (req.method === 'POST' && url === '/api/ssr') {
      return sendJson(res, 200, await handleSsr(await readJson(req)));
    }
    const mcpMatch = url.match(/^\/api\/mcp\/(render|validate|repair|summarize)$/);
    if (req.method === 'POST' && mcpMatch) {
      return sendJson(res, 200, await handleMcp(mcpMatch[1] as McpTool, await readJson(req)));
    }
    const resMatch = url.match(/^\/api\/mcp\/resources\/([\w.-]+)$/);
    if (req.method === 'GET' && resMatch) {
      return sendJson(res, 200, await handleResource(resMatch[1]));
    }
    if (url === '/api/health') {
      return sendJson(res, 200, { ok: true, backend: 'graphein-gallery' });
    }
    return next();
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: errMessage(err) });
  }
}

/** Vite plugin exposing the live SSR + MCP backend for the gallery. */
export function grapheinBackend(): Plugin {
  const mw = (req: Req, res: Res, next: Next): void => {
    void dispatch(req, res, next);
  };
  return {
    name: 'graphein-gallery-backend',
    configureServer(server) {
      server.middlewares.use(mw);
    },
    configurePreviewServer(server) {
      server.middlewares.use(mw);
    },
  };
}
