import { FORBIDDEN_WORD, sellerSentence } from './seller-text.js';

describe('sellerSentence', () => {
  it.each([
    ['in the driveway', 'In the driveway.'],
    ['  Garage,   Driveway\n', 'Garage, Driveway.'],
    ['Yes, approximately 10 years ago', 'Yes, approximately 10 years ago.'],
    ['Ground source heat pump feeding radiators.', 'Ground source heat pump feeding radiators.'],
    ['Is it shared?', 'Is it shared?'],
  ])('tidies %j into %j', (raw, tidy) => {
    expect(sellerSentence(raw)).toBe(tidy);
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['only spaces', '   '],
    ['a bare yes', 'Yes'],
    ['a bare no with a full stop', 'No.'],
    ['unknown', 'Unknown'],
    ['a date the seller did not know', 'Yes, date unknown'],
    ['N/A', 'N/A'],
    ['the word null', 'null'],
  ])('writes nothing for %s', (_, raw) => {
    expect(sellerSentence(raw)).toBeNull();
  });
});

describe('FORBIDDEN_WORD', () => {
  it.each(['null', 'undefined', 'Unknown', 'n/a', 'N/A', 'NaN'])('matches %s', (word) => {
    expect(FORBIDDEN_WORD.test(`Heating: ${word}.`)).toBe(true);
  });

  it.each(['annual fee', 'Nanny flat', 'unknowable', 'nullified'])(
    'leaves %s alone, since it only matches whole words',
    (words) => {
      expect(FORBIDDEN_WORD.test(words)).toBe(false);
    },
  );
});
