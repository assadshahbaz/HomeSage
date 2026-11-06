import { ThinkBlockFilter } from './think-block-filter.js';

function filtered(chunks: readonly string[]): string {
  const filter = new ThinkBlockFilter();
  return chunks.map((chunk) => filter.push(chunk)).join('') + filter.flush();
}

describe('ThinkBlockFilter', () => {
  it.each([
    ['text with no block', ['Two flats ', 'match.'], 'Two flats match.'],
    ['a whole block in one chunk', ['<think>plan</think>Two flats.'], 'Two flats.'],
    ['an opening tag split across chunks', ['<th', 'ink>plan</think>Two'], 'Two'],
    ['a closing tag split across chunks', ['<think>plan</thi', 'nk>Two'], 'Two'],
    [
      'a tag split into single characters',
      ['<', 't', 'h', 'i', 'n', 'k', '>', 'x', '<', '/', 't', 'h', 'i', 'n', 'k', '>', 'o', 'k'],
      'ok',
    ],
    ['two blocks', ['<think>a</think>One <think>b</think>two'], 'One two'],
    ['an unclosed block at the end', ['Two flats<think>and then'], 'Two flats'],
    ['a less than sign that starts no tag', ['price < ', '£200k'], 'price < £200k'],
    [
      'a held partial tag that turns out to be text',
      ['under <th', 'ree hundred'],
      'under <three hundred',
    ],
    ['a partial tag left at the end', ['Two flats <thi'], 'Two flats <thi'],
  ])('handles %s', (_, chunks, expected) => {
    expect(filtered(chunks)).toBe(expected);
  });

  it('holds back only what could start a tag', () => {
    const filter = new ThinkBlockFilter();

    expect(filter.push('Two flats <th')).toBe('Two flats ');
    expect(filter.push('e end')).toBe('<the end');
  });
});
