import type { GoogleGenAI } from '@google/genai';
import { ZodError } from 'zod';
import type { EmbeddingRequest } from '../../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../../infra/config/embeddings.config.js';
import { GeminiEmbeddingProvider } from './gemini-embedding.provider.js';

const MODEL = 'embed-model';
const DIMENSIONS = 3;

function request(texts: string[]): EmbeddingRequest {
  return { model: MODEL, texts, dimensions: DIMENSIONS, signal: new AbortController().signal };
}

function providerWith(
  embeddings: unknown = { embeddings: [{ values: [0.1, 0.2, 0.3] }, { values: [0.4, 0.5, 0.6] }] },
  count: unknown = { totalTokens: 29 },
): {
  provider: GeminiEmbeddingProvider;
  embedContent: ReturnType<typeof vi.fn>;
  countTokens: ReturnType<typeof vi.fn>;
} {
  const embedContent = vi.fn().mockResolvedValue(embeddings);
  const countTokens = vi.fn().mockResolvedValue(count);
  const client = { models: { embedContent, countTokens } } as unknown as Pick<
    GoogleGenAI,
    'models'
  >;
  return { provider: new GeminiEmbeddingProvider(client), embedContent, countTokens };
}

describe('GeminiEmbeddingProvider', () => {
  it('sends each text as its own content, so each gets its own vector', async () => {
    const { provider, embedContent } = providerWith();

    await provider.embedDocuments(request(['first listing', 'second listing']));

    expect(embedContent.mock.calls[0]?.[0]).toMatchObject({
      model: MODEL,
      contents: [
        { role: 'user', parts: [{ text: 'first listing' }] },
        { role: 'user', parts: [{ text: 'second listing' }] },
      ],
    });
  });

  it.each([
    ['documents', 'embedDocuments', 'RETRIEVAL_DOCUMENT'],
    ['queries', 'embedQueries', 'RETRIEVAL_QUERY'],
  ] as const)(
    'embeds %s with their own task type and the configured size',
    async (_, method, taskType) => {
      const { provider, embedContent } = providerWith();
      const sent = request(['a', 'b']);

      await provider[method](sent);

      expect(embedContent.mock.calls[0]?.[0]).toMatchObject({
        config: { taskType, outputDimensionality: DIMENSIONS, abortSignal: sent.signal },
      });
    },
  );

  it('counts the same contents for the tokens, since the embedding response has none', async () => {
    const { provider, embedContent, countTokens } = providerWith();
    const sent = request(['a', 'b']);

    const result = await provider.embedDocuments(sent);

    expect(countTokens.mock.calls[0]?.[0]).toMatchObject({
      model: MODEL,
      contents: (embedContent.mock.calls[0]?.[0] as { contents: unknown }).contents,
      config: { abortSignal: sent.signal },
    });
    expect(result).toEqual({
      vectors: [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ],
      inputTokens: 29,
    });
  });

  it('rejects an embedding response that does not have the expected shape', async () => {
    const { provider } = providerWith({ embeddings: [{ values: 'not numbers' }] });

    await expect(provider.embedDocuments(request(['a']))).rejects.toBeInstanceOf(ZodError);
  });

  it('rejects a token count that is missing', async () => {
    const { provider } = providerWith(undefined, {});

    await expect(provider.embedDocuments(request(['a', 'b']))).rejects.toBeInstanceOf(ZodError);
  });

  it.each([
    ['a rate limit that names no wait', { status: 429 }, 0],
    [
      'a rate limit that names its wait',
      {
        status: 429,
        message:
          'Quota exceeded for metric: generativelanguage.googleapis.com/embed_content_free_tier_requests, limit: 100, model: gemini-embedding-2\nPlease retry in 29.555438456s.',
      },
      29_556,
    ],
    ['an internal error', { status: 500 }, 0],
    ['an overloaded server', { status: 503 }, 0],
    ['a bad request', { status: 400 }, null],
    ['a rejected key', { status: 401 }, null],
    ['a dropped connection', new TypeError('fetch failed'), 0],
    ['any other error', new Error('something else'), null],
  ])('says whether %s is worth retrying, and how soon', (_, error, retryAfter) => {
    expect(providerWith().provider.retryAfterMs(error)).toBe(retryAfter);
  });

  it('refuses to boot without a key', () => {
    const config = { provider: 'gemini', apiKey: null } as unknown as EmbeddingsConfig;

    expect(() => GeminiEmbeddingProvider.fromConfig(config)).toThrow(
      'EMBED_API_KEY is required when EMBED_PROVIDER is gemini',
    );
  });
});
