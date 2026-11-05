import { ZodError } from 'zod';
import type { EmbeddingRequest } from '../../../core/embedding-provider.js';
import type { EmbeddingsConfig } from '../../../infra/config/embeddings.config.js';
import { OllamaEmbeddingProvider } from './ollama-embedding.provider.js';
import type { OllamaSettings } from './ollama-embedding.provider.js';

const MODEL = 'embed-model';
const DIMENSIONS = 3;
const BASE_URL = 'http://127.0.0.1:11434';
const DOCUMENT_PREFIX = 'search_document:';
const QUERY_PREFIX = 'search_query:';

function request(texts: string[]): EmbeddingRequest {
  return { model: MODEL, texts, dimensions: DIMENSIONS, signal: new AbortController().signal };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const EMBEDDED = {
  model: MODEL,
  embeddings: [
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6],
  ],
  prompt_eval_count: 42,
};

function providerWith(
  response: Response | Promise<Response> = json(EMBEDDED),
  settings: Partial<OllamaSettings> = {},
): { provider: OllamaEmbeddingProvider; fetchFn: ReturnType<typeof vi.fn> } {
  const fetchFn = vi.fn(() => Promise.resolve(response));
  const provider = new OllamaEmbeddingProvider(
    { baseUrl: BASE_URL, documentPrefix: null, queryPrefix: null, ...settings },
    fetchFn,
  );
  return { provider, fetchFn };
}

function sentBody(fetchFn: ReturnType<typeof vi.fn>): unknown {
  const init = fetchFn.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('OllamaEmbeddingProvider', () => {
  it('posts the model and the texts in order to the embed endpoint, with the call signal', async () => {
    const { provider, fetchFn } = providerWith();
    const sent = request(['first listing', 'second listing']);

    await provider.embedDocuments(sent);

    const [url, init] = fetchFn.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe(`${BASE_URL}/api/embed`);
    expect(init).toMatchObject({ method: 'POST', signal: sent.signal });
    expect(sentBody(fetchFn)).toEqual({
      model: MODEL,
      input: ['first listing', 'second listing'],
      truncate: false,
    });
  });

  it.each([
    ['documents', 'embedDocuments', `${DOCUMENT_PREFIX} a listing`],
    ['queries', 'embedQueries', `${QUERY_PREFIX} a listing`],
  ] as const)('puts the configured prefix before %s', async (_, method, expected) => {
    const { provider, fetchFn } = providerWith(json(EMBEDDED), {
      documentPrefix: DOCUMENT_PREFIX,
      queryPrefix: QUERY_PREFIX,
    });

    await provider[method](request(['a listing']));

    expect(sentBody(fetchFn)).toMatchObject({ input: [expected] });
  });

  it('sends the text as it is when no prefix is configured', async () => {
    const { provider, fetchFn } = providerWith();

    await provider.embedQueries(request(['a listing']));

    expect(sentBody(fetchFn)).toMatchObject({ input: ['a listing'] });
  });

  it('returns the vectors in order and the tokens the model read', async () => {
    const { provider } = providerWith();

    await expect(provider.embedDocuments(request(['a', 'b']))).resolves.toEqual({
      vectors: EMBEDDED.embeddings,
      inputTokens: 42,
    });
  });

  it('rejects a response of the wrong shape rather than passing it on', async () => {
    const { provider } = providerWith(json({ embeddings: [['not a number']] }));

    await expect(provider.embedDocuments(request(['a']))).rejects.toBeInstanceOf(ZodError);
  });

  it("fails with Ollama's own message and status on an error response", async () => {
    const { provider } = providerWith(
      json({ error: 'model "embed-model" not found, try pulling it first' }, 404),
    );

    const failure = await provider.embedDocuments(request(['a'])).catch((error: unknown) => error);

    expect(failure).toMatchObject({
      message: 'Ollama answered 404: model "embed-model" not found, try pulling it first',
      status: 404,
    });
  });

  it('keeps a body that is not JSON as the message', async () => {
    const { provider } = providerWith(new Response('Bad Gateway', { status: 502 }));

    await expect(provider.embedDocuments(request(['a']))).rejects.toThrow(
      'Ollama answered 502: Bad Gateway',
    );
  });

  it.each([
    ['a refused connection', new TypeError('fetch failed'), 0],
    ['a server error', { status: 500 }, 0],
    ['a model that was never pulled', { status: 404 }, null],
    ['a text past the context length', { status: 400 }, null],
    ['any other error', new Error('something else'), null],
  ])('says whether %s is worth retrying', (_, error, retryAfter) => {
    expect(providerWith().provider.retryAfterMs(error)).toBe(retryAfter);
  });

  it('refuses to boot without the server URL', () => {
    const config = { provider: 'ollama', baseUrl: null } as unknown as EmbeddingsConfig;

    expect(() => OllamaEmbeddingProvider.fromConfig(config)).toThrow(
      'EMBED_BASE_URL is required when EMBED_PROVIDER is ollama',
    );
  });
});
