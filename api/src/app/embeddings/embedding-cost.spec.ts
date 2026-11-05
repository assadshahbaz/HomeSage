import { embeddingCostUsd } from './embedding-cost.js';

describe('embeddingCostUsd', () => {
  it.each([
    [1_000_000, 0.2, 0.2],
    [2_500, 0.2, 0.0005],
    [0, 0.2, 0],
    [1_000_000, 0, 0],
  ])('costs %i tokens at $%s per million as $%s', (tokens, price, cost) => {
    expect(embeddingCostUsd(tokens, price)).toBeCloseTo(cost, 10);
  });
});
