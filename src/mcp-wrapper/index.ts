/**
 * Litho MCP stdio wrapper — bundled to resources/bin/litho-mcp.js
 *
 * Bridges MCP clients (Claude Desktop, Cursor, etc.) over stdio to the
 * HTTP MCP server running inside the Litho Electron app.
 *
 * Client configuration:
 *   { "command": "node", "args": ["/path/to/litho-mcp.js"] }
 *
 * Discovery file: ~/.litho/mcp-port  →  { port: number, token: string }
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const DISCOVERY_FILE = join(homedir(), '.litho', 'mcp-port');
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 500;

async function readDiscovery(): Promise<{ port: number; token: string }> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const raw = await readFile(DISCOVERY_FILE, 'utf8');
      return JSON.parse(raw) as { port: number; token: string };
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  process.stderr.write('litho-mcp: Litho is not running. Start Litho and try again.\n');
  process.exit(1);
}

async function main(): Promise<void> {
  const { port, token } = await readDiscovery();
  const serverUrl = `http://127.0.0.1:${port}/mcp`;
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    Authorization: `Bearer ${token}`,
  };

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let requestId: unknown = null;
    try {
      requestId = (JSON.parse(trimmed) as { id?: unknown }).id ?? null;
    } catch {
      // non-parseable line — skip
      continue;
    }

    try {
      const response = await fetch(serverUrl, { method: 'POST', headers, body: trimmed });

      if (!response.ok) {
        const body = await response.text();
        process.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: requestId,
            error: { code: -32603, message: `HTTP ${response.status}: ${body}` },
          }) + '\n',
        );
        continue;
      }

      // The Streamable HTTP transport returns SSE-formatted responses.
      // Extract JSON from `data:` lines and forward each as a plain JSON-RPC line.
      const text = await response.text();
      for (const rawLine of text.split('\n')) {
        const dataLine = rawLine.startsWith('data:') ? rawLine.slice(5).trim() : '';
        if (dataLine) process.stdout.write(dataLine + '\n');
      }
    } catch (err) {
      process.stderr.write(`litho-mcp: connection error: ${err}\n`);
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: requestId,
          error: { code: -32603, message: 'Lost connection to Litho' },
        }) + '\n',
      );
    }
  }
}

main().catch((err) => {
  process.stderr.write(`litho-mcp: fatal: ${err}\n`);
  process.exit(1);
});
