/** A piece of one line of the answer. Every piece is shown as text, never as HTML. */
export type AnswerInline =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'strong'; readonly text: string }
  /** `[P-1207]`. `linked` is true when the final citations name the id. */
  | {
      readonly kind: 'citation';
      readonly id: string;
      readonly marker: string;
      readonly linked: boolean;
    }
  | { readonly kind: 'sql'; readonly marker: string };

export type AnswerLine = readonly AnswerInline[];

/** A paragraph of lines, or a list of items, each item one line. */
export type AnswerBlock =
  | { readonly kind: 'paragraph'; readonly lines: readonly AnswerLine[] }
  | { readonly kind: 'list'; readonly items: readonly AnswerLine[] };

const BLANK_LINES = /\n[ \t]*\n/;
const LIST_ITEM = /^\s*(?:[-*•]|\d+[.)])\s+/;
// A marker in the form the citation guard lets through, or text in double asterisks.
const SQL_MARKER = '[SQL]';
const CITATION_START = '[P-';
const INLINE = /\[P-(\d+)\]|\[SQL\]|\*\*([^*\n]+)\*\*/g;

/**
 * The answer as blocks to render: paragraphs split on blank lines, list items
 * on lines that start with a bullet or a number, and inside each line the
 * citation markers and any bold. The prompt asks for plain text, so this is
 * all the markdown it needs; anything else, HTML included, stays as text.
 * Once the citations are `final`, a property marker they leave out is
 * dropped with the spaces before it, so no link can point at an id they lack.
 */
export function parseAnswer(
  text: string,
  linkedIds: ReadonlySet<string>,
  final = false,
): AnswerBlock[] {
  const citations: Citations = { linkedIds, final };
  return text
    .replace(/\r\n?/g, '\n')
    .split(BLANK_LINES)
    .flatMap((chunk) => blocksOf(chunk, citations));
}

/** Which ids may link, and whether that list is the final one. */
interface Citations {
  readonly linkedIds: ReadonlySet<string>;
  readonly final: boolean;
}

function blocksOf(chunk: string, citations: Citations): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const raw of chunk.split('\n')) {
    const line = raw.trimEnd();
    if (line.trim() === '') {
      continue;
    }
    const isItem = LIST_ITEM.test(line);
    const parsed = inlineOf(isItem ? line.replace(LIST_ITEM, '') : line.trim(), citations);
    const last = blocks.at(-1);
    if (isItem) {
      if (last?.kind === 'list') {
        blocks[blocks.length - 1] = { kind: 'list', items: [...last.items, parsed] };
      } else {
        blocks.push({ kind: 'list', items: [parsed] });
      }
    } else if (last?.kind === 'paragraph') {
      blocks[blocks.length - 1] = { kind: 'paragraph', lines: [...last.lines, parsed] };
    } else {
      blocks.push({ kind: 'paragraph', lines: [parsed] });
    }
  }
  return blocks;
}

function inlineOf(line: string, { linkedIds, final }: Citations): AnswerLine {
  const parts: AnswerInline[] = [];
  let at = 0;
  for (const match of line.matchAll(INLINE)) {
    if (match.index > at) {
      parts.push({ kind: 'text', text: line.slice(at, match.index) });
    }
    const [marker, id = '', strong = ''] = match;
    if (marker === SQL_MARKER) {
      parts.push({ kind: 'sql', marker });
    } else if (marker.startsWith(CITATION_START)) {
      const linked = linkedIds.has(id);
      if (final && !linked) {
        dropTrailingSpace(parts);
      } else {
        parts.push({ kind: 'citation', id, marker, linked });
      }
    } else {
      parts.push({ kind: 'strong', text: strong });
    }
    at = match.index + marker.length;
  }
  if (at < line.length) {
    parts.push({ kind: 'text', text: line.slice(at) });
  }
  return parts;
}

// The space before a dropped marker would otherwise sit before the punctuation after it.
function dropTrailingSpace(parts: AnswerInline[]): void {
  const last = parts.at(-1);
  if (last?.kind !== 'text') {
    return;
  }
  const text = last.text.trimEnd();
  if (text === '') {
    parts.pop();
  } else {
    parts[parts.length - 1] = { kind: 'text', text };
  }
}
