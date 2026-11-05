import { SSE_FRAME_MAX_CHARS, SseFrameParser } from './sse-frame-parser';

/** Feeds the chunks in order and collects every payload. */
function parse(...chunks: string[]): string[] {
  const parser = new SseFrameParser();
  return chunks.flatMap((chunk) => parser.push(chunk).payloads);
}

const TWO_FRAMES = 'event: token\ndata: {"a":1}\n\nevent: done\ndata: {"b":"£2"}\n\n';

describe('SseFrameParser', () => {
  it('returns the data of each complete frame', () => {
    expect(parse(TWO_FRAMES)).toEqual(['{"a":1}', '{"b":"£2"}']);
  });

  it.each([
    ['\\n', '\n'],
    ['\\r\\n', '\r\n'],
    ['\\r', '\r'],
  ])('reads the same frames split at every offset, with %s line endings', (_label, newline) => {
    const text = TWO_FRAMES.replaceAll('\n', newline);

    for (let offset = 0; offset <= text.length; offset++) {
      expect(parse(text.slice(0, offset), text.slice(offset))).toEqual(['{"a":1}', '{"b":"£2"}']);
    }
  });

  it('reads one character at a time', () => {
    expect(parse(...TWO_FRAMES.split(''))).toEqual(['{"a":1}', '{"b":"£2"}']);
  });

  it('joins several data lines with a newline', () => {
    expect(parse('data: first\ndata: second\n\n')).toEqual(['first\nsecond']);
  });

  it('keeps a value with no space after the colon, and a data line with no colon', () => {
    expect(parse('data:tight\ndata\n\n')).toEqual(['tight\n']);
  });

  it('drops heartbeat comments and frames with no data', () => {
    expect(parse(': heartbeat\n\nevent: token\n\nid: 7\nretry: 10\n\n')).toEqual([]);
  });

  it('ends a frame on a chunk that ends in \\r, without waiting for the next chunk', () => {
    const parser = new SseFrameParser();

    expect(parser.push('data: done\r\r').payloads).toEqual(['done']);
    expect(parser.push('\ndata: next\r\n\r\n').payloads).toEqual(['next']);
  });

  it('reads \\r\\n split across chunks as one line ending, not a blank line', () => {
    expect(parse('data: first\r', '\ndata: second\r\n\r\n')).toEqual(['first\nsecond']);
  });

  it('holds a trailing partial frame until it completes', () => {
    const parser = new SseFrameParser();

    expect(parser.push('data: {"a":').payloads).toEqual([]);
    expect(parser.push('1}\n').payloads).toEqual([]);
    expect(parser.push('\n').payloads).toEqual(['{"a":1}']);
  });

  it('reports a frame past the limit, whether in one line or across lines', () => {
    const half = 'x'.repeat(SSE_FRAME_MAX_CHARS / 2);

    expect(new SseFrameParser().push(`data: ${'x'.repeat(SSE_FRAME_MAX_CHARS)}`).overflow).toBe(
      true,
    );
    expect(new SseFrameParser().push(`data: ${half}\ndata: ${half}\ndata: x`).overflow).toBe(true);
  });

  it('does not report a frame at the limit, or the size of frames already completed', () => {
    const parser = new SseFrameParser();
    const full = 'x'.repeat(SSE_FRAME_MAX_CHARS);

    expect(parser.push(`data: ${full}\n`).overflow).toBe(false);
    expect(parser.push('\n').payloads).toEqual([full]);
    expect(parser.push(`data: ${full}\n`).overflow).toBe(false);
  });
});
