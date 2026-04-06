import { createInterface } from 'node:readline';
import { log } from './logger';

/**
 * Minimal JSON-RPC 2.0 transport over stdio for headless mode.
 *
 * - stdin: newline-delimited JSON-RPC requests (one request per line).
 * - stdout: newline-delimited JSON-RPC responses and notifications.
 * - stderr: reserved for diagnostic logs (see logger.ts).
 *
 * The transport is intentionally minimal: no batch requests, no JSON-RPC
 * over websocket, just one request per line with one response per line.
 */

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: number | string | null;
  result: unknown;
}

export interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type MethodHandler = (params: unknown) => Promise<unknown> | unknown;

// Standard JSON-RPC error codes.
export const RPC_PARSE_ERROR = -32700;
export const RPC_INVALID_REQUEST = -32600;
export const RPC_METHOD_NOT_FOUND = -32601;
export const RPC_INVALID_PARAMS = -32602;
export const RPC_INTERNAL_ERROR = -32603;

export interface Dispatcher {
  register(method: string, handler: MethodHandler): void;
  notify(method: string, params: unknown): void;
  start(): void;
  stop(): void;
}

function writeFrame(obj: unknown): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`);
}

export function createDispatcher(options: { onShutdown: () => void }): Dispatcher {
  const handlers = new Map<string, MethodHandler>();
  let rl: ReturnType<typeof createInterface> | null = null;
  let stopped = false;

  function notify(method: string, params: unknown): void {
    if (stopped) return;
    const frame: JsonRpcNotification = { jsonrpc: '2.0', method, params };
    writeFrame(frame);
  }

  async function handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed);
    } catch (err) {
      log('error', 'Failed to parse JSON-RPC request', { line: trimmed });
      writeFrame({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: RPC_PARSE_ERROR,
          message: 'Parse error',
          data: err instanceof Error ? err.message : String(err),
        },
      } satisfies JsonRpcError);
      return;
    }

    if (request.jsonrpc !== '2.0' || typeof request.method !== 'string') {
      writeFrame({
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: { code: RPC_INVALID_REQUEST, message: 'Invalid Request' },
      } satisfies JsonRpcError);
      return;
    }

    const handler = handlers.get(request.method);
    if (!handler) {
      writeFrame({
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: { code: RPC_METHOD_NOT_FOUND, message: `Method not found: ${request.method}` },
      } satisfies JsonRpcError);
      return;
    }

    try {
      const result = await handler(request.params ?? {});
      const response: JsonRpcSuccess = {
        jsonrpc: '2.0',
        id: request.id ?? null,
        result: result ?? {},
      };
      writeFrame(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Honor a `code` property on the thrown error — handlers can signal
      // -32602 (invalid params) or other JSON-RPC codes by attaching `code`
      // to the Error object (see workspace-paths.assertWorkspaceNameSafe).
      // Anything without a code falls through as -32603 internal error.
      const rawCode = (err as { code?: unknown }).code;
      const code =
        typeof rawCode === 'number' && Number.isInteger(rawCode) ? rawCode : RPC_INTERNAL_ERROR;
      log(code === RPC_INTERNAL_ERROR ? 'error' : 'warn', `Handler ${request.method} rejected`, {
        code,
        error: message,
        stack: err instanceof Error ? err.stack : undefined,
      });
      writeFrame({
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code,
          message,
          // Only leak stacks for true internal errors — validation failures
          // don't need a stack trace, the message is enough.
          data:
            code === RPC_INTERNAL_ERROR && err instanceof Error ? { stack: err.stack } : undefined,
        },
      } satisfies JsonRpcError);
    }
  }

  function start(): void {
    rl = createInterface({ input: process.stdin });
    // Serialize request handling: each line waits for the previous handler
    // to resolve before running. This guarantees that stateful sequences
    // like `provider.setCredential` → `agent.run` or `workspace.create` →
    // `document.create` see consistent state even though each handler is
    // async. `agent.run` itself returns quickly and then streams events
    // via `notify`, so serialization does not block the chat loop.
    let queue: Promise<void> = Promise.resolve();
    rl.on('line', (line) => {
      queue = queue
        .then(() => handleLine(line))
        .catch((err) => {
          log('error', 'handleLine crashed outside normal error path', {
            error: err instanceof Error ? err.message : String(err),
          });
        });
    });
    rl.on('close', () => {
      log('info', 'stdin closed, shutting down');
      options.onShutdown();
    });
  }

  function stop(): void {
    stopped = true;
    rl?.close();
    rl = null;
  }

  return {
    register(method, handler) {
      handlers.set(method, handler);
    },
    notify,
    start,
    stop,
  };
}
