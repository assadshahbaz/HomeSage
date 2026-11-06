import { QUESTION_MAX_LENGTH, questionSchema } from './question.contract.js';

describe('questionSchema', () => {
  it('trims the question', () => {
    expect(questionSchema.parse('  3 bed flats in AB15 ')).toBe('3 bed flats in AB15');
  });

  it('accepts a question at the length limit', () => {
    expect(questionSchema.safeParse('a'.repeat(QUESTION_MAX_LENGTH)).success).toBe(true);
  });

  it.each([
    ['an empty question', ''],
    ['only spaces', '   '],
    ['one character over the limit', 'a'.repeat(QUESTION_MAX_LENGTH + 1)],
  ])('rejects %s', (_label, question) => {
    expect(questionSchema.safeParse(question).success).toBe(false);
  });
});
