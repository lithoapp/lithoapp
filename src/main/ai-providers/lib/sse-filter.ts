// ---------------------------------------------------------------------------
// SSE filter for openai-compatible providers
// ---------------------------------------------------------------------------
// Some providers (e.g. MiniMax) send non-standard SSE events like
// {"type":"ping","cost":"0"} that the ai-sdk can't parse. This fetch wrapper
// intercepts streaming responses and filters out events without a `choices`
// field — matching how OpenCode's Zen proxy handles these server-side.
// ---------------------------------------------------------------------------

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

    const filtered = new ReadableStream<Uint8Array>({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          // Flush any remaining buffer
          if (buffer.trim()) {
            const event = parseSseEvent(buffer);
            if (event !== null) controller.enqueue(encoder.encode(event));
          }
          controller.close();
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE event boundary)
        const parts = buffer.split('\n\n');
        // Last part is incomplete — keep it in buffer
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const event = parseSseEvent(part);
          if (event !== null) {
            controller.enqueue(encoder.encode(event));
          }
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
