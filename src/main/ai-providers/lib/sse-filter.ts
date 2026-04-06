// ---------------------------------------------------------------------------
// SSE filter for openai-compatible providers
// ---------------------------------------------------------------------------
// Some providers (e.g. MiniMax) send non-standard SSE events like
// {"type":"ping","cost":"0"} that the ai-sdk can't parse. This fetch wrapper
// intercepts streaming responses and filters out events without a `choices`
// field — matching how OpenCode's Zen proxy handles these server-side.
//
// IMPORTANT: pull() loops until it enqueues at least one chunk (or upstream
// is done). If pull() returns without enqueueing, the stream consumer can
// stall waiting for data that the ReadableStream re-pull mechanism doesn't
// reliably deliver. This was observed as a multi-minute hang on minimax
// requests where the upstream sent a burst of OPENROUTER PROCESSING comments
// followed by partial-event chunks — without the loop, the SSE filter would
// stop polling the upstream after the first non-enqueueing pull and the
// connection would silently die.
// ---------------------------------------------------------------------------

import { log } from '../../headless/logger';

export function createSseFilterFetch(
  inner: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await inner(input, init);

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream') || !response.body) {
      return response;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = '';

    let chunkCount = 0;
    let totalBytesIn = 0;
    let eventsParsed = 0;
    let eventsPassed = 0;
    let eventsDropped = 0;

    const filtered = new ReadableStream<Uint8Array>({
      async pull(controller) {
        // Loop until we enqueue at least one chunk or the upstream is done.
        // See file header for the rationale — without this loop, the consumer
        // can stall when upstream sends partial events or batches of
        // filtered-out events.
        let enqueuedThisCall = false;
        while (!enqueuedThisCall) {
          const { done, value } = await reader.read();
          if (done) {
            // Flush any remaining buffer
            if (buffer.trim()) {
              eventsParsed++;
              const event = parseSseEvent(buffer);
              if (event !== null) {
                eventsPassed++;
                controller.enqueue(encoder.encode(event));
              } else {
                eventsDropped++;
              }
            }
            log('info', 'sse-filter:done', {
              chunks: chunkCount,
              bytesIn: totalBytesIn,
              parsed: eventsParsed,
              passed: eventsPassed,
              dropped: eventsDropped,
            });
            controller.close();
            return;
          }

          chunkCount++;
          totalBytesIn += value.byteLength;
          buffer += decoder.decode(value, { stream: true });

          // Split on double-newline (SSE event boundary)
          const parts = buffer.split('\n\n');
          // Last part is incomplete — keep it in buffer
          buffer = parts.pop() ?? '';

          for (const part of parts) {
            if (!part.trim()) continue;
            eventsParsed++;
            const event = parseSseEvent(part);
            if (event !== null) {
              eventsPassed++;
              controller.enqueue(encoder.encode(event));
              enqueuedThisCall = true;
            } else {
              eventsDropped++;
            }
          }
          // If we processed a chunk but didn't enqueue anything (partial event
          // or all events filtered out), loop and read another chunk.
        }
      },
    });

    return new Response(filtered, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function parseSseEvent(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Find the data line
  const dataLine = trimmed.split('\n').find((l) => l.startsWith('data: ') || l.startsWith('data:'));
  if (!dataLine) return `${trimmed}\n\n`;

  const jsonStr = dataLine.startsWith('data: ') ? dataLine.slice(6) : dataLine.slice(5);

  // [DONE] sentinel — always pass through
  if (jsonStr.trim() === '[DONE]') return `${trimmed}\n\n`;

  // Try parsing — if it has `choices`, pass through; otherwise drop
  try {
    const parsed = JSON.parse(jsonStr);
    if ('choices' in parsed) return `${trimmed}\n\n`;
    // Non-standard event (e.g. {"type":"ping","cost":"0"}) — drop it
    return null;
  } catch {
    // Unparseable — pass through and let the SDK decide
    return `${trimmed}\n\n`;
  }
}
