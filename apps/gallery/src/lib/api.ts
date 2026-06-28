/**
 * Tiny client for the gallery's dev/preview backend (see src/server/backend.ts).
 * In a static build the endpoints don't exist, so each call surfaces a typed
 * "backend unavailable" signal the pages render as a graceful fallback.
 */
import type { ChartSpec } from 'graphein';

export class BackendUnavailableError extends Error {
  constructor(message = 'Live backend is not available in this build.') {
    super(message);
    this.name = 'BackendUnavailableError';
  }
}

export interface SsrResult {
  ok: boolean;
  pngBase64?: string;
  report?: unknown;
  width?: number;
  height?: number;
  dpr?: number;
  ms?: number;
  error?: string;
}

export type McpTool = 'render' | 'validate' | 'repair' | 'summarize';

export interface McpContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface McpToolResult {
  content: McpContent[];
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpResource {
  ok: boolean;
  name?: string;
  uri?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  text?: string;
  error?: string;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new BackendUnavailableError();
  }
  if (res.status === 404) throw new BackendUnavailableError();
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new BackendUnavailableError();
  return (await res.json()) as T;
}

export async function ssrRender(
  spec: ChartSpec,
  opts: { width?: number; height?: number; dpr?: number } = {},
): Promise<SsrResult> {
  return postJson<SsrResult>('/api/ssr', { spec, ...opts });
}

export async function mcpCall(tool: McpTool, body: Record<string, unknown>): Promise<McpToolResult> {
  return postJson<McpToolResult>(`/api/mcp/${tool}`, body);
}

export async function fetchMcpResource(name: string): Promise<McpResource> {
  let res: Response;
  try {
    res = await fetch(`/api/mcp/resources/${name}`);
  } catch {
    throw new BackendUnavailableError();
  }
  if (res.status === 404) throw new BackendUnavailableError();
  const ct = res.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw new BackendUnavailableError();
  return (await res.json()) as McpResource;
}

let healthCache: Promise<boolean> | null = null;

/** Whether the live backend (SSR/MCP) is reachable. Cached for the session. */
export function backendAvailable(): Promise<boolean> {
  healthCache ??= (async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) return false;
      const body = (await res.json()) as { ok?: boolean };
      return body.ok === true;
    } catch {
      return false;
    }
  })();
  return healthCache;
}
