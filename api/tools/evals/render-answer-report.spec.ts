import { renderAnswerReport, uncitedIds } from './render-answer-report.ts';
import type { AnswerEvalRun, AnswerResult } from './render-answer-report.ts';

const GROUNDED: AnswerResult = {
  label: 'hybrid',
  question: 'a quiet 3 bed family home in Inverurie under £250k',
  routedAs: 'hybrid',
  contextIds: ['1207', '1342'],
  answer: 'Two homes match.\n\nOne has a garden [P-1207].',
  citedIds: ['1207'],
  inputTokens: 2400,
  outputTokens: 180,
  firstTokenMs: 900,
  totalMs: 2100,
};

const INVENTED: AnswerResult = {
  ...GROUNDED,
  label: 'semantic',
  citedIds: ['1207', '9999'],
};

function run(overrides: Partial<AnswerEvalRun> = {}): AnswerEvalRun {
  return {
    finishedAt: new Date('2026-10-10T09:00:00Z'),
    durationMs: 61_000,
    provider: 'some-provider',
    answerModel: 'answer-model',
    prompt: 'answer.v1',
    results: [GROUNDED, INVENTED],
    narrative: null,
    ...overrides,
  };
}

describe('uncitedIds', () => {
  it('is empty when every cited id was in the context', () => {
    expect(uncitedIds(GROUNDED)).toEqual([]);
  });

  it('lists a cited id the context did not hold', () => {
    expect(uncitedIds(INVENTED)).toEqual(['9999']);
  });
});

describe('renderAnswerReport', () => {
  it('counts the answers whose citations were all in the context', () => {
    expect(renderAnswerReport(run())).toContain('Every citation in the context: 1 of 2 answers.');
  });

  it('names a citation from outside the context in the summary', () => {
    expect(renderAnswerReport(run())).toContain(
      '| semantic | hybrid | 2 | 2 | P-9999 | 900 | 2100 |',
    );
  });

  it('quotes each answer line by line, keeping blank lines out of the quote', () => {
    expect(renderAnswerReport(run())).toContain(
      '> Two homes match.\n\n> One has a garden [P-1207].',
    );
  });

  it('keeps the hand written section, or marks it as not written', () => {
    expect(renderAnswerReport(run({ narrative: 'Answers stayed grounded.' }))).toContain(
      '## What it shows\n\nAnswers stayed grounded.',
    );
    expect(renderAnswerReport(run())).toContain('## What it shows\n\n_Not written yet._');
  });
});
