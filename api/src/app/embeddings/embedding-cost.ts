const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** What embedding `inputTokens` costs in US dollars, at a list price per million tokens. */
export function embeddingCostUsd(inputTokens: number, usdPerMillion: number): number {
  return (inputTokens * usdPerMillion) / TOKENS_PER_PRICE_UNIT;
}
