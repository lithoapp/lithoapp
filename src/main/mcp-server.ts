import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { createServer, type Server as HttpServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { app } from 'electron';
import { z } from 'zod';
import { createLithoTools } from './ai-providers/agents/litho-tools';
import { listWorkspaces } from './workspace-data';

const LITHO_MCP_DIR = join(homedir(), '.litho');
const DISCOVERY_FILE = join(LITHO_MCP_DIR, 'mcp-port');

let httpServer: HttpServer | null = null;

// Pre-computed tool shapes (workspace-independent, computed once at startup)
type ToolShape = Record<string, z.ZodType>;
type ToolShapes = Record<string, { description: string; shape: ToolShape }>;

function buildToolShapes(): ToolShapes {
  // Use a placeholder workspace slug to access inputSchema shapes.
  // The db() getter inside each tool is lazy — it's never called here,
  // only when execute() is invoked. So this is safe with any string.
  const tools = createLithoTools('__template__', 'workspace');
  const shapes: ToolShapes = {};

  for (const [name, toolDef] of Object.entries(tools)) {
    // Cast via unknown: the AI SDK types inputSchema as FlexibleSchema but
    // createLithoTools always passes a z.object(), so .shape is available.
    const inputSchema = toolDef.inputSchema as unknown as z.ZodObject<Record<string, z.ZodType>>;
    shapes[name] = {
      description: toolDef.description ?? name,
      shape: {
        ...inputSchema.shape,
        workspace: z
          .string()
          .describe('Workspace slug (run listWorkspaces to see available slugs)'),
      },
    };
  }

  return shapes;
}

function buildMcpServer(toolShapes: ToolShapes): McpServer {
  const server = new McpServer({ name: 'litho', version: app.getVersion() });

  // listWorkspaces — no workspace param needed, lets clients discover slugs
  server.tool(
    'listWorkspaces',
    'List all Litho workspaces with their slugs and titles.',
    {},
    async () => {
      const workspaces = await listWorkspaces();
      if (workspaces.length === 0)
        return { content: [{ type: 'text' as const, text: '(no workspaces)' }] };
      const lines = workspaces.map((w) => `${w.slug}\t${w.title}`).join('\n');
      return { content: [{ type: 'text' as const, text: lines }] };
    },
  );

  for (const [name, { description, shape }] of Object.entries(toolShapes)) {
    server.tool(name, description, shape as Record<string, z.ZodType>, async (args) => {
      const { workspace, ...rest } = args as Record<string, unknown> & { workspace: string };
      const tools = createLithoTools(workspace, 'workspace');
      const toolDef = tools[name as keyof typeof tools];
      if (!toolDef) throw new Error(`Unknown tool: ${name}`);
      const execute = toolDef.execute;
      if (!execute) throw new Error(`Tool ${name} has no execute function`);
      const result = await execute(rest as never, {} as never);
      return { content: [{ type: 'text' as const, text: String(result) }] };
    });
  }

  return server;
}

export async function startMcpServer(): Promise<void> {
  const token = randomBytes(32).toString('hex');
  const toolShapes = buildToolShapes();

  const server = createServer(async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${token}`) {
      res.writeHead(401, { 'Content-Type': 'text/plain' }).end('Unauthorized');
      return;
    }

    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }

    const mcpServer = buildMcpServer(toolShapes);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const { port } = server.address() as { port: number };
  await mkdir(LITHO_MCP_DIR, { recursive: true });
  await writeFile(DISCOVERY_FILE, JSON.stringify({ port, token }), 'utf8');

  httpServer = server;
  console.log(`[mcp] Server listening on 127.0.0.1:${port}`);
}

export async function stopMcpServer(): Promise<void> {
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = null;
  }
  await unlink(DISCOVERY_FILE).catch(() => {});
}
