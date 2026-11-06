import { toSpokenText } from './spoken-text.js';

describe('toSpokenText', () => {
  it('removes property and SQL citations and the space they leave', () => {
    expect(toSpokenText('A 3 bed house at £250,000 [P-1207], with a garden [P-1207] [P-88].')).toBe(
      'A 3 bed house at £250,000, with a garden.',
    );
    expect(toSpokenText('The average price is £187,400 across 53 listings [SQL].')).toBe(
      'The average price is £187,400 across 53 listings.',
    );
  });

  it('puts the answer on one line', () => {
    expect(toSpokenText('First home [P-1].\n\nSecond home [P-2].\n')).toBe(
      'First home. Second home.',
    );
  });

  it('drops brackets left empty', () => {
    expect(toSpokenText('A flat ([P-5]) in AB10.')).toBe('A flat in AB10.');
  });

  it('leaves other square brackets alone', () => {
    expect(toSpokenText('Price [guide] £100,000')).toBe('Price [guide] £100,000');
  });
});
