// ---------------------------------------------------------------------------
// Diagnostic fetch wrapper — logs network-level events for AI provider calls
// ---------------------------------------------------------------------------
// Log message taxonomy:
//   fetch:request      – outbound request details (before network)
//   fetch:error        – thrown error from inner fetch (DNS / TCP failure)
//   fetch:response     – response status + timing (after headers arrive)
//   fetch:first-chunk  – first SSE byte received (TTFB at stream level)
//   fetch:stream-done  – stream fully consumed (debug level)
//   fetch:stream-error – error while reading stream body
// ---------------------------------------------------------------------------

import { log } from '../../headless/logger';

type FetchFn = typeof globalThis.fetch;

const ALLOWED_RESPONSE_HEADERS = new Set([
  'content-type',
  'x-request-id',
  'cf-ray',
  'x-ratelimit-remaining',
  'x-ratelimit-limit',
  'x-ratelimit-remaining-requests',
  'x-ratelimit-remaining-tokens',
  'retry-after',
  'anthropic-ratelimit-requests-remaining',
  'anthropic-ratelimit-tokens-remaining',
]);

function sanitizeUrl(input: RequestInfo | URL): string {
  try {
    const raw =
      input instanceof URL
        ? input.href
        : typeof input === 'string'
          ? input
          : (input as Request).url;
    const u = new URL(raw);
    u.search = '';
    return u.toString();
  } catch {
    return '[unparseable-url]';
  }
}

function pickHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (ALLOWED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      out[key.toLowerCase()] = value;
    }
  });
  return out;
}

function bodyByteSize(init: RequestInit | undefined): number {
  if (!init?.body) return 0;
  const b = init.body;
  if (typeof b === 'string') return new TextEncoder().encode(b).byteLength;
  if (b instanceof Uint8Array) return b.byteLength;
  if (b instanceof ArrayBuffer) return b.byteLength;
  return -1; // opaque (ReadableStream / FormData)
}

export function createDiagnosticFetch(inner: FetchFn = globalThis.fetch): FetchFn {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = sanitizeUrl(input);
    const method = init?.method ?? 'POST';
    const reqStartMs = Date.now();

    log('info', 'fetch:request', { url, method, bodyBytes: bodyByteSize(init) });

    let response: Response;
    try {
      response = await inner(input, init);
    } catch (err) {
      log('error', 'fetch:error', {
        url,
        method,
        elapsedMs: Date.now() - reqStartMs,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    const contentType = response.headers.get('content-type') ?? '';
    const isStream = contentType.includes('text/event-stream');

    log('info', 'fetch:response', {
      url,
      status: response.status,
      elapsedMs: Date.now() - reqStartMs,
      isStream,
      headers: pickHeaders(response.headers),
    });

    if (!isStream || !response.body) return response;

    const reader = response.body.getReader();
    let firstChunkLogged = false;
    let chunkCount = 0;

    const wrappedBody = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            log('debug', 'fetch:stream-done', { url, chunks: chunkCount });
            controller.close();
            return;
          }
          if (!firstChunkLogged) {
            firstChunkLogged = true;
            log('info', 'fetch:first-chunk', { url, ttfbMs: Date.now() - reqStartMs });
          }
          chunkCount++;
          controller.enqueue(value);
        } catch (err) {
          log('error', 'fetch:stream-error', {
            url,
            chunks: chunkCount,
            elapsedMs: Date.now() - reqStartMs,
            error: err instanceof Error ? err.message : String(err),
          });
          controller.error(err);
        }
      },
      cancel(reason) {
        log('debug', 'fetch:stream-done', { url, chunks: chunkCount, cancelled: true });
        return reader.cancel(reason);
      },
    });

    return new Response(wrappedBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
