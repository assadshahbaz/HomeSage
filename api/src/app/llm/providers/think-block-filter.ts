const OPEN = '<think>';
const CLOSE = '</think>';

/**
 * Drops `<think>` blocks from a streamed reply, the way the completed call
 * strips them, when a tag can arrive split across chunks. Text that could be
 * the start of an opening tag is held back until the next chunk shows what it
 * is. An unclosed block at the end is dropped with it.
 */
export class ThinkBlockFilter {
  private buffer = '';
  private inside = false;

  /** Takes the next chunk and returns the text that is safe to pass on. */
  public push(chunk: string): string {
    this.buffer += chunk;
    let passed = '';
    for (;;) {
      if (this.inside) {
        const end = this.buffer.indexOf(CLOSE);
        if (end === -1) {
          // Keep only what could be the start of the closing tag.
          this.buffer = this.buffer.slice(-(CLOSE.length - 1));
          return passed;
        }
        this.buffer = this.buffer.slice(end + CLOSE.length);
        this.inside = false;
        continue;
      }
      const start = this.buffer.indexOf(OPEN);
      if (start !== -1) {
        passed += this.buffer.slice(0, start);
        this.buffer = this.buffer.slice(start + OPEN.length);
        this.inside = true;
        continue;
      }
      const held = partialTagLength(this.buffer);
      passed += this.buffer.slice(0, this.buffer.length - held);
      this.buffer = this.buffer.slice(this.buffer.length - held);
      return passed;
    }
  }

  /** The text still held back once the stream has ended. */
  public flush(): string {
    const rest = this.inside ? '' : this.buffer;
    this.buffer = '';
    this.inside = false;
    return rest;
  }
}

/** How many characters at the end of `text` could begin an opening tag. */
function partialTagLength(text: string): number {
  for (let length = Math.min(OPEN.length - 1, text.length); length > 0; length--) {
    if (OPEN.startsWith(text.slice(-length))) {
      return length;
    }
  }
  return 0;
}
