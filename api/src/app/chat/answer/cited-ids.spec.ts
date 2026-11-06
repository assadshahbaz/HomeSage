import { citedPropertyIds } from './cited-ids.js';

describe('citedPropertyIds', () => {
  it.each([
    ['no markers', 'No listing in the data matches.', []],
    ['one marker', 'A garden [P-1207].', ['1207']],
    ['order of first appearance', 'Two homes [P-1342] and [P-1207].', ['1342', '1207']],
    [
      'a repeat counted once',
      '[P-1207] has a garage. [P-1342] too. [P-1207] is cheaper.',
      ['1207', '1342'],
    ],
    ['an aggregate marker', 'There are 53 listings [SQL].', []],
    ['a marker with no digits', 'Cited as [P-].', []],
    ['a marker with letters', 'Cited as [P-12a].', []],
    ['a marker without its prefix', 'Cited as [1207].', []],
    ['an unclosed marker', 'Cited as [P-1207', []],
    ['several ids in one marker', 'Cited as [P-1207, P-1342].', []],
  ])('reads %s', (_, text, expected) => {
    expect(citedPropertyIds(text)).toEqual(expected);
  });
});
