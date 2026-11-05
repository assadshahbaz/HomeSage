import type { EmbeddingProvider } from '../../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../../infra/config/embeddings.config.js';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider.js';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider.js';

type ProviderFactory = (config: EmbeddingsConfig) => EmbeddingProvider;

/**
 * Every embedding vendor the API has an adapter for, by the name
 * `EMBED_PROVIDER` uses. The only place outside an adapter that knows vendors
 * exist: adding one is a class implementing `EmbeddingProvider` and an entry here.
 */
const PROVIDERS: Readonly<Record<string, ProviderFactory>> = {
  gemini: (config) => GeminiEmbeddingProvider.fromConfig(config),
  ollama: (config) => OllamaEmbeddingProvider.fromConfig(config),
};

/** Names `EMBED_PROVIDER` may take, for the boot error when it names none of them. */
export function registeredEmbeddingProviders(): readonly string[] {
  return Object.keys(PROVIDERS);
}

/**
 * Builds the provider `EMBED_PROVIDER` names. An unknown name stops the process
 * at boot, listing the names that would work.
 */
export function createEmbeddingProvider(config: EmbeddingsConfig): EmbeddingProvider {
  if (!Object.hasOwn(PROVIDERS, config.provider)) {
    throw new Error(
      `EMBED_PROVIDER ${config.provider} has no adapter. Registered: ${registeredEmbeddingProviders().join(', ')}`,
    );
  }
  return PROVIDERS[config.provider](config);
}
