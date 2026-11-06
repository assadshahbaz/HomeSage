import { GatewayTimeoutException, UnprocessableEntityException } from '@nestjs/common';
import { isDailyQuotaSpent, isProviderFailure, summariseError } from './provider-errors.ts';

/** An SDK error the way both provider SDKs raise one: a message and an HTTP status. */
function providerError(status: number, message: string): Error {
  return Object.assign(new Error(message), { status });
}

const GEMINI_DAILY = providerError(
  429,
  '{"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_requests","status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}',
);
const GROQ_DAILY = providerError(
  429,
  '429 {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000, Used 199500","type":"tokens","code":"rate_limit_exceeded"}}',
);
const GROQ_PER_MINUTE = providerError(
  429,
  '429 {"error":{"message":"Rate limit reached for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Used 7800","type":"tokens","code":"rate_limit_exceeded"}}',
);
const OVERLOADED = providerError(
  503,
  '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary.","status":"UNAVAILABLE"}}',
);

describe('isProviderFailure', () => {
  it.each([
    ['an overload', OVERLOADED],
    ['a per minute rate limit', GROQ_PER_MINUTE],
    ['a spent daily quota', GROQ_DAILY],
    ['our own timeout', new GatewayTimeoutException('Model x did not answer in time')],
  ])('is true for %s', (_, error) => {
    expect(isProviderFailure(error)).toBe(true);
  });

  it.each([
    ['a query that failed twice', new UnprocessableEntityException('failed twice')],
    ['a bad request from us', providerError(400, 'invalid model')],
    ['a plain error', new Error('boom')],
  ])('is false for %s', (_, error) => {
    expect(isProviderFailure(error)).toBe(false);
  });
});

describe('isDailyQuotaSpent', () => {
  it.each([
    ["Gemini's wording", GEMINI_DAILY],
    ["Groq's wording", GROQ_DAILY],
  ])('recognises a spent daily quota in %s', (_, error) => {
    expect(isDailyQuotaSpent(error)).toBe(true);
  });

  it.each([
    ['a per minute limit, which comes back within the run', GROQ_PER_MINUTE],
    ['an overload', OVERLOADED],
    ['an error with no status', new Error('tokens per day')],
  ])('is false for %s', (_, error) => {
    expect(isDailyQuotaSpent(error)).toBe(false);
  });
});

describe('summariseError', () => {
  it("keeps the first sentence of the provider's message, not its whole body", () => {
    expect(summariseError(OVERLOADED)).toBe(
      'provider returned 503: This model is currently experiencing high demand',
    );
  });

  it('keeps a plain error message as it is', () => {
    expect(summariseError(new Error('connect ECONNREFUSED'))).toBe('connect ECONNREFUSED');
  });

  it('cuts a long message short', () => {
    expect(summariseError(new Error('x'.repeat(500)))).toHaveLength(160);
  });
});
