import type { LlmConfig } from '../../../infra/config/llm.config.js';
import { GeminiLlmProvider } from './gemini-llm.provider.js';
import { GroqLlmProvider } from './groq-llm.provider.js';
import { createLlmProvider, registeredProviders } from './llm-provider-registry.js';

const JOB = {
  model: 'some-model',
  inputUsdPerMillion: 1,
  outputUsdPerMillion: 2,
  timeoutMs: 30000,
  temperature: null,
};

function configFor(provider: string): LlmConfig {
  return {
    provider,
    apiKey: 'llm-key',
    maxAttempts: 3,
    router: JOB,
    answer: JOB,
  };
}

describe('createLlmProvider', () => {
  it.each([
    ['gemini', GeminiLlmProvider],
    ['groq', GroqLlmProvider],
  ])('builds the %s adapter when LLM_PROVIDER names it', (name, adapter) => {
    expect(createLlmProvider(configFor(name))).toBeInstanceOf(adapter);
  });

  it('stops at boot on a provider with no adapter, listing the ones that exist', () => {
    expect(() => createLlmProvider(configFor('some-other-vendor'))).toThrow(
      `LLM_PROVIDER some-other-vendor has no adapter. Registered: ${registeredProviders().join(', ')}`,
    );
  });

  it.each(['toString', 'constructor', '__proto__'])(
    'does not treat %s as a provider name',
    (name) => {
      expect(() => createLlmProvider(configFor(name))).toThrow('has no adapter');
    },
  );
});
