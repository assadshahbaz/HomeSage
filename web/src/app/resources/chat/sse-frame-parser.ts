/**
 * The most characters one frame's data may hold. The largest real event, a
 * `retrieval` with eight properties or an aggregate's values, is a few kB.
 */
export const SSE_FRAME_MAX_CHARS = 262_144;

/** What one chunk completed. */
export interface SseParseResult {
  /** The `data` of every frame the chunk completed, in order. */
  readonly payloads: readonly string[];
  /** The frame still being read has passed `SSE_FRAME_MAX_CHARS`. */
  readonly overflow: boolean;
}

/**
 * Reads server sent events incrementally: decoded text in, the `data` of each
 * complete frame out, however the text was split into chunks. Comment lines
 * (heartbeats) and every field other than `data` are dropped.
 */
export class SseFrameParser {
  private buffer = '';
  private dataLines: string[] = [];
  private frameChars = 0;
  private afterCarriageReturn = false;

  /** Adds the next chunk and returns the frames it completed. */
  public push(chunk: string): SseParseResult {
    let text = chunk;
    // The previous chunk ended in `\r`, so a leading `\n` completes that line ending.
    if (this.afterCarriageReturn && text !== '') {
      this.afterCarriageReturn = false;
      if (text.startsWith('\n')) {
        text = text.slice(1);
      }
    }
    this.buffer += text;
    const payloads: string[] = [];
    let lineStart = 0;

    for (let index = 0; index < this.buffer.length; index++) {
      const char = this.buffer[index];
      if (char !== '\n' && char !== '\r') {
        continue;
      }
      const line = this.buffer.slice(lineStart, index);
      if (char === '\r') {
        if (index === this.buffer.length - 1) {
          this.afterCarriageReturn = true;
        } else if (this.buffer[index + 1] === '\n') {
          index++;
        }
      }
      lineStart = index + 1;

      const payload = this.readLine(line);
      if (payload !== null) {
        payloads.push(payload);
      }
    }

    this.buffer = this.buffer.slice(lineStart);
    return { payloads, overflow: this.frameChars + this.buffer.length > SSE_FRAME_MAX_CHARS };
  }

  /** Applies one line, returning the frame's data when the line ends a frame. */
  private readLine(line: string): string | null {
    if (line === '') {
      if (this.dataLines.length === 0) {
        return null;
      }
      const payload = this.dataLines.join('\n');
      this.dataLines = [];
      this.frameChars = 0;
      return payload;
    }

    const colon = line.indexOf(':');
    // A line starting with a colon is a comment; a field other than `data` is not needed.
    if (colon === 0 || (colon === -1 ? line : line.slice(0, colon)) !== 'data') {
      return null;
    }
    const raw = colon === -1 ? '' : line.slice(colon + 1);
    const value = raw.startsWith(' ') ? raw.slice(1) : raw;
    this.dataLines.push(value);
    this.frameChars += value.length;
    return null;
  }
}
