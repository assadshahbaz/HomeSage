/** One server sent event: its `event:` name, or `message` when it has none, and its data. */
export interface SseFrame {
  readonly event: string;
  readonly data: string;
}

const DEFAULT_EVENT = 'message';
const FRAME_END = '\n\n';

/**
 * Reads a server sent events body into frames as they arrive. Comment lines,
 * such as HomeSage's heartbeat, are skipped, and multi line data is joined
 * with newlines as the spec says.
 */
export async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n?/g, '\n');
    let boundary = buffer.indexOf(FRAME_END);
    while (boundary !== -1) {
      const frame = parseFrame(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + FRAME_END.length);
      if (frame !== null) {
        yield frame;
      }
      boundary = buffer.indexOf(FRAME_END);
    }
  }
  const last = parseFrame(buffer + decoder.decode());
  if (last !== null) {
    yield last;
  }
}

function parseFrame(text: string): SseFrame | null {
  let event = DEFAULT_EVENT;
  const data: string[] = [];
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // One space after the colon belongs to the syntax, not the value.
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      data.push(value);
    }
  }
  return data.length === 0 ? null : { event, data: data.join('\n') };
}
