import { GatewayTimeoutException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type {
  EmbeddingProvider,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../infra/config/embeddings.config.js';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import { EmbeddingService } from './embedding.service.js';

const MODEL = 'embed-model';
const DIMENSIONS = 4;
const RATE_LIMITED = Object.assign(new Error('429 Resource exhausted'), { status: 429 });
const BAD_REQUEST = Object.assign(new Error('400 Invalid argument'), { status: 400 });

function settings(overrides: Partial<EmbeddingsConfig> = {}): EmbeddingsConfig {
  return {
    provider: 'some-provider',
    apiKey: 'embed-key',
    baseUrl: null,
    documentPrefix: null,
    queryPrefix: null,
    model: MODEL,
    dimensions: DIMENSIONS,
    batchSize: 100,
    timeoutMs: 5_000,
    maxAttempts: 3,
    textsPerMinute: null,
    inputUsdPerMillion: 0.2,
    ...overrides,
  };
}

// A vector that says which text it came from, so order can be checked.
function vectorFor(text: string): number[] {
  return [Number(text.split(' ')[1]), 0, 0, 0];
}

function answering(request: EmbeddingRequest): Promise<EmbeddingResponse> {
  return Promise.resolve({
    vectors: request.texts.map(vectorFor),
    inputTokens: request.texts.length * 10,
  });
}

function build(options: {
  embed?: (request: EmbeddingRequest) => Promise<EmbeddingResponse>;
  config?: Partial<EmbeddingsConfig>;
  retryAfter?: (error: unknown) => number | null;
}): {
  service: EmbeddingService;
  embedDocuments: ReturnType<typeof vi.fn>;
  embedQueries: ReturnType<typeof vi.fn>;
  log: ReturnType<typeof vi.fn>;
} {
  const embedDocuments = vi.fn(options.embed ?? answering);
  const embedQueries = vi.fn(answering);
  const provider: EmbeddingProvider = {
    embedDocuments,
    embedQueries,
    retryAfterMs: options.retryAfter ?? ((error) => (error === RATE_LIMITED ? 0 : null)),
  };
  const config = { getOrThrow: () => settings(options.config) } as unknown as ConfigService;
  const log = vi.fn();
  const logger = { log } as unknown as AppLogger;
  return {
    service: new EmbeddingService(provider, config, logger),
    embedDocuments,
    embedQueries,
    log,
  };
}

function texts(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `text ${String(index)}`);
}

describe('EmbeddingService batching', () => {
  it('splits texts into batches of EMBED_BATCH_SIZE and keeps their order', async () => {
    const { service, embedDocuments } = build({});

    const result = await service.embedDocuments(texts(250));

    expect(
      embedDocuments.mock.calls.map(([request]) => (request as EmbeddingRequest).texts.length),
    ).toEqual([100, 100, 50]);
    expect(result.vectors.map((vector) => vector[0])).toEqual(texts(250).map((_, index) => index));
  });

  it('adds up tokens and cost across the batches', async () => {
    const { service } = build({});

    const { usage } = await service.embedDocuments(texts(250));

    expect(usage).toEqual({ calls: 3, inputTokens: 2500, costUsd: 0.0005 });
  });

  it('sends the configured model and dimensions with a deadline signal', async () => {
    const { service, embedDocuments } = build({});

    await service.embedDocuments(texts(2));

    expect(embedDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODEL, dimensions: DIMENSIONS, texts: texts(2) }),
    );
    expect((embedDocuments.mock.calls[0]?.[0] as EmbeddingRequest).signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it('makes no call for no texts', async () => {
    const { service, embedDocuments } = build({});

    await expect(service.embedDocuments([])).resolves.toEqual({
      vectors: [],
      usage: { calls: 0, inputTokens: 0, costUsd: 0 },
    });
    expect(embedDocuments).not.toHaveBeenCalled();
  });

  it('embeds a query through the query method and returns its one vector', async () => {
    const { service, embedDocuments, embedQueries } = build({});

    const result = await service.embedQuery('query 7');

    expect(result.vector).toEqual([7, 0, 0, 0]);
    expect(embedQueries).toHaveBeenCalledTimes(1);
    expect(embedDocuments).not.toHaveBeenCalled();
  });
});

describe('EmbeddingService retries', () => {
  it('retries a rate limited batch and succeeds without failing the run', async () => {
    const embed = vi
      .fn<(request: EmbeddingRequest) => Promise<EmbeddingResponse>>()
      .mockRejectedValueOnce(RATE_LIMITED)
      .mockImplementation(answering);
    const { service, embedDocuments, log } = build({ embed });

    const result = await service.embedDocuments(texts(3));

    expect(result.vectors).toHaveLength(3);
    expect(embedDocuments).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      `embed document ${MODEL}`,
      expect.objectContaining({ attempts: 2, batchSize: 3 }),
      'EmbeddingService',
    );
  });

  it('gives up after EMBED_MAX_ATTEMPTS and throws the last failure', async () => {
    const embed = vi.fn(() => Promise.reject(RATE_LIMITED));
    const { service, embedDocuments } = build({ embed, config: { maxAttempts: 2 } });

    await expect(service.embedDocuments(texts(3))).rejects.toBe(RATE_LIMITED);
    expect(embedDocuments).toHaveBeenCalledTimes(2);
  });

  it('never retries a failure the provider says is not worth it', async () => {
    const embed = vi.fn(() => Promise.reject(BAD_REQUEST));
    const { service, embedDocuments } = build({ embed });

    await expect(service.embedDocuments(texts(3))).rejects.toBe(BAD_REQUEST);
    expect(embedDocuments).toHaveBeenCalledTimes(1);
  });

  it('turns a batch that outlives EMBED_TIMEOUT_MS into a 504, retries included', async () => {
    // Rate limited every time, and the first pause alone is longer than the deadline.
    const embed = vi.fn(() => Promise.reject(RATE_LIMITED));
    const { service } = build({ embed, config: { timeoutMs: 50 } });

    const call = service.embedDocuments(texts(3));

    await expect(call).rejects.toBeInstanceOf(GatewayTimeoutException);
    await expect(call).rejects.toThrow('Embedding model embed-model did not answer within 50 ms');
  });

  it('turns a call cut off by the deadline into a 504', async () => {
    const embed = (request: EmbeddingRequest): Promise<EmbeddingResponse> =>
      new Promise((_, reject) => {
        request.signal.addEventListener('abort', () => {
          reject(new Error('The operation was aborted'));
        });
      });
    const { service } = build({ embed, config: { timeoutMs: 20 } });

    await expect(service.embedDocuments(texts(1))).rejects.toBeInstanceOf(GatewayTimeoutException);
  });
});

describe('EmbeddingService waits', () => {
  it('waits as long as the provider asks when that is longer than the backoff', async () => {
    const embed = vi
      .fn<(request: EmbeddingRequest) => Promise<EmbeddingResponse>>()
      .mockRejectedValueOnce(RATE_LIMITED)
      .mockImplementation(answering);
    const { service } = build({ embed, retryAfter: () => 900 });

    const startedAt = Date.now();
    await service.embedDocuments(texts(1));

    // The first backoff is 500 ms; the provider asked for 900.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(850);
  });

  it('fails with a 504 at once when the provider asks for longer than the batch has left', async () => {
    const embed = vi.fn(() => Promise.reject(RATE_LIMITED));
    const { service } = build({ embed, retryAfter: () => 60_000, config: { timeoutMs: 5_000 } });

    const startedAt = Date.now();
    const failure = await service.embedDocuments(texts(1)).catch((error: unknown) => error);
    // Well inside the 5 s deadline, and still saying what the vendor refused.
    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(failure).toBeInstanceOf(GatewayTimeoutException);
    expect((failure as Error).cause).toBe(RATE_LIMITED);
  });

  it('refuses at boot a batch size that could never fit EMBED_TEXTS_PER_MINUTE', () => {
    expect(() => build({ config: { batchSize: 100, textsPerMinute: 50 } })).toThrow(
      'EMBED_BATCH_SIZE 100 is more than EMBED_TEXTS_PER_MINUTE 50',
    );
  });

  it('sends at once while the texts fit under EMBED_TEXTS_PER_MINUTE', async () => {
    const { service, embedDocuments } = build({ config: { batchSize: 10, textsPerMinute: 30 } });

    const startedAt = Date.now();
    await service.embedDocuments(texts(30));

    expect(embedDocuments).toHaveBeenCalledTimes(3);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});

describe('EmbeddingService checks', () => {
  it('fails loudly on a vector of the wrong size, without retrying', async () => {
    const embed = vi.fn((request: EmbeddingRequest) =>
      Promise.resolve({ vectors: request.texts.map(() => [0, 0, 0]), inputTokens: 1 }),
    );
    const { service } = build({ embed, retryAfter: () => 0 });

    await expect(service.embedDocuments(texts(2))).rejects.toThrow(
      'returned a vector of 3 dimensions, but EMBED_DIMENSIONS is 4',
    );
    expect(embed).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when the vectors do not match the texts one for one', async () => {
    const embed = vi.fn(() => Promise.resolve({ vectors: [[1, 0, 0, 0]], inputTokens: 1 }));
    const { service } = build({ embed });

    await expect(service.embedDocuments(texts(2))).rejects.toThrow(
      'returned 1 vectors for 2 texts',
    );
  });
});

describe('EmbeddingService logging', () => {
  it('logs model, batch size, tokens, attempts, latency and cost for each batch', async () => {
    const { service, log } = build({ config: { inputUsdPerMillion: 0.2 } });

    await service.embedDocuments(texts(5));

    expect(log).toHaveBeenCalledWith(
      `embed document ${MODEL}`,
      {
        kind: 'document',
        model: MODEL,
        batchSize: 5,
        inputTokens: 50,
        attempts: 1,
        latencyMs: expect.any(Number) as number,
        costUsd: 0.00001,
      },
      'EmbeddingService',
    );
  });
});
