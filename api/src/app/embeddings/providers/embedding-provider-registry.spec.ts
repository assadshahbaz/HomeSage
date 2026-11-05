import type { EmbeddingsConfig } from '../../../infra/config/embeddings.config.js';
import {
  createEmbeddingProvider,
  registeredEmbeddingProviders,
} from './embedding-provider-registry.js';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider.js';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider.js';

function config(provider: string): EmbeddingsConfig {
  return {
    provider,
    apiKey: 'embed-key',
    baseUrl: 'http://127.0.0.1:11434',
    documentPrefix: null,
    queryPrefix: null,
    model: 'embed-model',
    dimensions: 1536,
    batchSize: 100,
    timeoutMs: 30_000,
    maxAttempts: 3,
    textsPerMinute: null,
    inputUsdPerMillion: 0.2,
  };
}

describe('createEmbeddingProvider', () => {
  it.each([
    ['gemini', GeminiEmbeddingProvider],
    ['ollama', OllamaEmbeddingProvider],
  ])('builds the adapter EMBED_PROVIDER names: %s', (name, adapter) => {
    expect(createEmbeddingProvider(config(name))).toBeInstanceOf(adapter);
  });

  it('stops the process at boot for a name with no adapter, listing the names that work', () => {
    expect(() => createEmbeddingProvider(config('vectors-r-us'))).toThrow(
      'EMBED_PROVIDER vectors-r-us has no adapter. Registered: gemini, ollama',
    );
  });

  it('does not treat a property of Object as a registered name', () => {
    expect(() => createEmbeddingProvider(config('toString'))).toThrow('has no adapter');
  });

  it('lists every registered name', () => {
    expect(registeredEmbeddingProviders()).toEqual(['gemini', 'ollama']);
  });
});
