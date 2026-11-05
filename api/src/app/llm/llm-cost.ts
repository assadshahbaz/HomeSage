import type { LlmJobConfig } from '../../infra/config/llm.config.js';

const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** What a call costs in US dollars, at the list price configured for its job. */
export function costUsd(job: LlmJobConfig, inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens * job.inputUsdPerMillion + outputTokens * job.outputUsdPerMillion) /
    TOKENS_PER_PRICE_UNIT
  );
}
