import type { AnswerBlock } from './answer-text';
import { parseAnswer } from './answer-text';

const NONE = new Set<string>();

function parse(text: string, linked: readonly string[] = []): AnswerBlock[] {
  return parseAnswer(text, new Set(linked));
}

describe('parseAnswer', () => {
  it('reads plain text as one paragraph of one line', () => {
    expect(parse('Two flats stand out.')).toEqual([
      { kind: 'paragraph', lines: [[{ kind: 'text', text: 'Two flats stand out.' }]] },
    ]);
  });

  it('splits paragraphs on blank lines and keeps single line breaks as lines', () => {
    const blocks = parse('First.  \nStill first.\n\n \nSecond.\r\n');

    expect(blocks).toEqual([
      {
        kind: 'paragraph',
        lines: [[{ kind: 'text', text: 'First.' }], [{ kind: 'text', text: 'Still first.' }]],
      },
      { kind: 'paragraph', lines: [[{ kind: 'text', text: 'Second.' }]] },
    ]);
  });

  it('reads bulleted and numbered lines as list items, next to paragraphs', () => {
    const blocks = parse('Three homes:\n- one\n* two\n3. three\nThat is all.');

    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'list', 'paragraph']);
    expect(blocks[1]).toEqual({
      kind: 'list',
      items: [
        [{ kind: 'text', text: 'one' }],
        [{ kind: 'text', text: 'two' }],
        [{ kind: 'text', text: 'three' }],
      ],
    });
  });

  it('finds property markers, linked only when the final citations name them', () => {
    const [block] = parse('A garden [P-1207] and parking [P-50].', ['1207']);

    expect(block).toEqual({
      kind: 'paragraph',
      lines: [
        [
          { kind: 'text', text: 'A garden ' },
          { kind: 'citation', id: '1207', marker: '[P-1207]', linked: true },
          { kind: 'text', text: ' and parking ' },
          { kind: 'citation', id: '50', marker: '[P-50]', linked: false },
          { kind: 'text', text: '.' },
        ],
      ],
    });
  });

  it('drops a marker the final citations leave out, with the space before it', () => {
    expect(parseAnswer('A garden [P-1207] and more [P-999].', new Set(['1207']), true)).toEqual([
      {
        kind: 'paragraph',
        lines: [
          [
            { kind: 'text', text: 'A garden ' },
            { kind: 'citation', id: '1207', marker: '[P-1207]', linked: true },
            { kind: 'text', text: ' and more' },
            { kind: 'text', text: '.' },
          ],
        ],
      },
    ]);
  });

  it('keeps that marker as text while the citations are not final', () => {
    const [block] = parseAnswer('More [P-999].', new Set(['1207']));

    expect(block.kind === 'paragraph' ? block.lines[0] : []).toContainEqual({
      kind: 'citation',
      id: '999',
      marker: '[P-999]',
      linked: false,
    });
  });

  it('drops a marker that starts a line without leaving an empty part', () => {
    expect(parseAnswer('[P-999] then text', NONE, true)).toEqual([
      { kind: 'paragraph', lines: [[{ kind: 'text', text: ' then text' }]] },
    ]);
  });

  it('finds a marker against a word or punctuation, and the aggregate marker', () => {
    const [block] = parse('There are 53[SQL].(see[P-3])', ['3']);

    expect(block.kind === 'paragraph' ? block.lines[0] : []).toEqual([
      { kind: 'text', text: 'There are 53' },
      { kind: 'sql', marker: '[SQL]' },
      { kind: 'text', text: '.(see' },
      { kind: 'citation', id: '3', marker: '[P-3]', linked: true },
      { kind: 'text', text: ')' },
    ]);
  });

  it('reads bold text', () => {
    const [block] = parse('**Ellon** homes');

    expect(block.kind === 'paragraph' ? block.lines[0] : []).toEqual([
      { kind: 'strong', text: 'Ellon' },
      { kind: 'text', text: ' homes' },
    ]);
  });

  it.each([
    ['a script tag', '<script>alert(1)</script>'],
    ['an image with a handler', '<img src=x onerror="alert(1)">'],
    ['a broken marker', 'a garden [P-12'],
    ['a marker with spaces', 'a garden [ P-12 ]'],
    ['an unclosed bold', '**half done'],
  ])('keeps %s as plain text', (_, text) => {
    expect(parse(text)).toEqual([{ kind: 'paragraph', lines: [[{ kind: 'text', text }]] }]);
  });

  it('gives nothing for an answer that has not started', () => {
    expect(parseAnswer('', NONE)).toEqual([]);
  });
});
