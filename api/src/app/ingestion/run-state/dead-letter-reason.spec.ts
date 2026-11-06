import { deadLetterReason } from './dead-letter-reason.js';

// The shape of the error Gemini's SDK raised in the first real ingestion run.
const GEMINI_RATE_LIMIT = new Error(
  JSON.stringify({
    error: {
      code: 429,
      message:
        'You exceeded your current quota, please check your plan and billing details.\n* Quota exceeded for metric: generativelanguage.googleapis.com/embed_content_free_tier_requests, limit: 100, model: gemini-embedding-2\nPlease retry in 29.555438456s.',
      status: 'RESOURCE_EXHAUSTED',
      details: [{ '@type': 'type.googleapis.com/google.rpc.Help' }],
    },
  }),
);

describe('deadLetterReason', () => {
  it("keeps only the vendor's message out of a JSON error body, on one line", () => {
    expect(deadLetterReason(GEMINI_RATE_LIMIT)).toBe(
      'You exceeded your current quota, please check your plan and billing details. * Quota exceeded for metric: generativelanguage.googleapis.com/embed_content_free_tier_requests, limit: 100, model: gemini-embedding-2 Please retry in 29.555438456s.',
    );
  });

  it('uses a plain error message as it is', () => {
    expect(deadLetterReason(new Error('connect ECONNREFUSED 127.0.0.1:9200'))).toBe(
      'connect ECONNREFUSED 127.0.0.1:9200',
    );
  });

  it('names the error a timeout wraps, since that is what actually went wrong', () => {
    const timeout = new Error('Embedding model did not answer within 30000 ms', {
      cause: GEMINI_RATE_LIMIT,
    });

    expect(deadLetterReason(timeout)).toMatch(
      /^Embedding model did not answer within 30000 ms, after: You exceeded your current quota, .*limit: 100/,
    );
  });

  it('describes something thrown that is not an error', () => {
    expect(deadLetterReason('stopped')).toBe('stopped');
  });

  it('caps a long reason so the list stays readable', () => {
    const reason = deadLetterReason(new Error('x'.repeat(1000)));

    expect(reason).toHaveLength(300);
    expect(reason.endsWith('…')).toBe(true);
  });
});
