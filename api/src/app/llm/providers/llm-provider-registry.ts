import type { LlmProvider } from '../../../core/llm-provider.js';
import type { LlmConfig } from '../../../infra/config/llm.config.js';
import { GeminiLlmProvider } from './gemini-llm.provider.js';
import { GroqLlmProvider } from './groq-llm.provider.js';

type ProviderFactory = (config: LlmConfig) => LlmProvider;

/**
 * Every model vendor the API has an adapter for, by the name `LLM_PROVIDER`
 * uses. The only place outside an adapter that knows vendors exist: adding
 * one is a class implementing `LlmProvider` and an entry here.
 */
const PROVIDERS: Readonly<Record<string, ProviderFactory>> = {
  gemini: (config) => GeminiLlmProvider.fromConfig(config),
  groq: (config) => GroqLlmProvider.fromConfig(config),
};

/** Names `LLM_PROVIDER` may take, for the boot error when it names none of them. */
export function registeredProviders(): readonly string[] {
  return Object.keys(PROVIDERS);
}

/**
 * Builds the provider `LLM_PROVIDER` names. An unknown name stops the process
 * at boot, listing the names that would work.
 */
export function createLlmProvider(config: LlmConfig): LlmProvider {
  if (!Object.hasOwn(PROVIDERS, config.provider)) {
    throw new Error(
      `LLM_PROVIDER ${config.provider} has no adapter. Registered: ${registeredProviders().join(', ')}`,
    );
  }
  return PROVIDERS[config.provider](config);
}
