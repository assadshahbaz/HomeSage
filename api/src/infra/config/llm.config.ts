import { registerAs } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { validateEnv } from './env.validation.js';

/** The model serving one job, the list price its calls are costed at, how long each may take and how it samples. */
export interface LlmJobConfig {
  readonly model: string;
  readonly inputUsdPerMillion: number;
  readonly outputUsdPerMillion: number;
  readonly timeoutMs: number;
  readonly temperature: number | null;
}

/**
 * Which provider serves model calls and which model does each job. All of it
 * comes from the environment, so switching vendor or model is a config change
 * and eval reports record exactly what produced them.
 */
export const llmConfig = registerAs('llm', () => {
  const env = validateEnv(process.env);

  const router: LlmJobConfig = {
    model: env.LLM_ROUTER_MODEL,
    inputUsdPerMillion: env.LLM_ROUTER_INPUT_USD_PER_MILLION,
    outputUsdPerMillion: env.LLM_ROUTER_OUTPUT_USD_PER_MILLION,
    timeoutMs: env.LLM_ROUTER_TIMEOUT_MS,
    temperature: env.LLM_ROUTER_TEMPERATURE,
  };
  const answer: LlmJobConfig = {
    model: env.LLM_ANSWER_MODEL,
    inputUsdPerMillion: env.LLM_ANSWER_INPUT_USD_PER_MILLION,
    outputUsdPerMillion: env.LLM_ANSWER_OUTPUT_USD_PER_MILLION,
    timeoutMs: env.LLM_TIMEOUT_MS,
    temperature: null,
  };

  return {
    provider: env.LLM_PROVIDER,
    apiKey: env.LLM_API_KEY,
    maxAttempts: env.LLM_MAX_ATTEMPTS,
    router,
    answer,
  };
});

export type LlmConfig = ConfigType<typeof llmConfig>;
