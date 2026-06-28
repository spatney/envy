#!/usr/bin/env node
/**
 * Stdio entry point for `graphein-mcp`. Connect this from any MCP client
 * (Claude Desktop, Copilot, Cursor, …) by pointing it at `npx graphein-mcp`.
 *
 * The MCP stdio transport speaks JSON-RPC over stdout, so **nothing** here may
 * write to stdout — all diagnostics go to stderr.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './create-server.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The transport keeps the process alive while the client is connected.
}

main().catch((err) => {
  console.error('[graphein-mcp] fatal:', err);
  process.exitCode = 1;
});
