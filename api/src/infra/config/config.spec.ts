import { afterEach, describe, expect, it, vi } from 'vitest';
import { appConfig } from './app.config.js';
import { mysqlConfig } from './mysql.config.js';
import { elasticsearchConfig } from './elasticsearch.config.js';
import { redisConfig } from './redis.config.js';
import { llmConfig } from './llm.config.js';
import { embeddingsConfig } from './embeddings.config.js';
import { sqlConfig } from './sql.config.js';
import { retrievalConfig } from './retrieval.config.js';
import { throttleConfig } from './throttle.config.js';

const ENV = {
  NODE_ENV: 'test',
  PORT: '4000',
  LOG_LEVEL: 'debug',
  MYSQL_HOST: 'db.test',
  MYSQL_PORT: '3307',
  MYSQL_DATABASE: 'homesage_test',
  MYSQL_RO_USER: 'rag_ro',
  MYSQL_RO_PASSWORD: 'ro-secret',
  ES_URL: 'http://es.test:9200',
  ES_REQUEST_TIMEOUT_MS: '2500',
  ES_INDEX: 'properties-test',
  REDIS_URL: 'redis://cache.test:6379',
  REDIS_COMMAND_TIMEOUT_MS: '250',
  THROTTLE_LIMIT: '5',
  THROTTLE_WINDOW_MS: '30000',
  LLM_PROVIDER: 'some-provider',
  LLM_API_KEY: 'llm-key',
  LLM_ROUTER_MODEL: 'router-model',
  LLM_ANSWER_MODEL: 'answer-model',
  LLM_ROUTER_INPUT_USD_PER_MILLION: '0.25',
  LLM_ROUTER_OUTPUT_USD_PER_MILLION: '1.5',
  LLM_ANSWER_INPUT_USD_PER_MILLION: '0.75',
  LLM_ANSWER_OUTPUT_USD_PER_MILLION: '3.75',
  LLM_TIMEOUT_MS: '15000',
  LLM_ROUTER_TIMEOUT_MS: '4000',
  LLM_ROUTER_TEMPERATURE: '0.2',
  LLM_MAX_ATTEMPTS: '2',
  EMBED_PROVIDER: 'embed-provider',
  EMBED_API_KEY: 'embed-key',
  EMBED_BASE_URL: 'http://127.0.0.1:11434',
  EMBED_DOCUMENT_PREFIX: 'search_document:',
  EMBED_QUERY_PREFIX: 'search_query:',
  EMBED_MODEL: 'embed-model',
  EMBED_DIMENSIONS: '1024',
  EMBED_BATCH_SIZE: '50',
  EMBED_TIMEOUT_MS: '20000',
  EMBED_MAX_ATTEMPTS: '4',
  EMBED_TEXTS_PER_MINUTE: '100',
  EMBED_INPUT_USD_PER_MILLION: '0.2',
  SQL_ROW_LIMIT: '25',
  SQL_STATEMENT_TIMEOUT_MS: '2000',
  RETRIEVAL_BRANCH_TIMEOUT_MS: '9000',
};

function stubEnv(overrides: Record<string, string | undefined> = {}): void {
  for (const [name, value] of Object.entries({ ...ENV, ...overrides })) {
    vi.stubEnv(name, value);
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('config namespaces', () => {
  it('reads the server settings', () => {
    stubEnv();

    expect(appConfig()).toEqual({ port: 4000, environment: 'test', logLevel: 'debug' });
  });

  it('reads the read only MySQL credentials', () => {
    stubEnv();

    expect(mysqlConfig()).toEqual({
      host: 'db.test',
      port: 3307,
      database: 'homesage_test',
      user: 'rag_ro',
      password: 'ro-secret',
    });
  });

  it('reads the Elasticsearch settings', () => {
    stubEnv();

    expect(elasticsearchConfig()).toEqual({
      url: 'http://es.test:9200',
      requestTimeoutMs: 2500,
      index: 'properties-test',
    });
  });

  it('reads the Redis settings', () => {
    stubEnv();

    expect(redisConfig()).toEqual({ url: 'redis://cache.test:6379', commandTimeoutMs: 250 });
  });

  it('reads a model id for each of the two jobs', () => {
    stubEnv();

    expect(llmConfig()).toEqual({
      provider: 'some-provider',
      apiKey: 'llm-key',
      maxAttempts: 2,
      router: {
        model: 'router-model',
        inputUsdPerMillion: 0.25,
        outputUsdPerMillion: 1.5,
        timeoutMs: 4000,
        temperature: 0.2,
      },
      answer: {
        model: 'answer-model',
        inputUsdPerMillion: 0.75,
        outputUsdPerMillion: 3.75,
        timeoutMs: 15000,
        temperature: null,
      },
    });
  });

  it('reads the embedding settings', () => {
    stubEnv();

    expect(embeddingsConfig()).toEqual({
      provider: 'embed-provider',
      apiKey: 'embed-key',
      baseUrl: 'http://127.0.0.1:11434',
      documentPrefix: 'search_document:',
      queryPrefix: 'search_query:',
      model: 'embed-model',
      dimensions: 1024,
      batchSize: 50,
      timeoutMs: 20000,
      maxAttempts: 4,
      textsPerMinute: 100,
      inputUsdPerMillion: 0.2,
    });
  });

  it('reads the optional embedding settings as null when they are not set', () => {
    stubEnv({
      EMBED_API_KEY: undefined,
      EMBED_BASE_URL: undefined,
      EMBED_DOCUMENT_PREFIX: undefined,
      EMBED_QUERY_PREFIX: undefined,
      EMBED_TEXTS_PER_MINUTE: undefined,
    });

    expect(embeddingsConfig()).toMatchObject({
      apiKey: null,
      baseUrl: null,
      documentPrefix: null,
      queryPrefix: null,
      textsPerMinute: null,
    });
  });

  it('reads the per IP request limit and its window', () => {
    stubEnv();

    expect(throttleConfig()).toEqual({ limit: 5, windowMs: 30000 });
  });

  it('reads the cap on rows a generated query may return', () => {
    stubEnv();

    expect(sqlConfig()).toEqual({ rowLimit: 25, statementTimeoutMs: 2000 });
  });

  it('reads how long hybrid retrieval waits for each branch', () => {
    stubEnv();

    expect(retrievalConfig()).toEqual({ branchTimeoutMs: 9000 });
  });

  it('refuses to build a namespace when its variable is missing', () => {
    stubEnv({ LLM_API_KEY: undefined });

    expect(() => llmConfig()).toThrow('LLM_API_KEY');
  });

  it('refuses to build a namespace when a variable has the wrong type', () => {
    stubEnv({ EMBED_DIMENSIONS: 'one thousand' });

    expect(() => embeddingsConfig()).toThrow('EMBED_DIMENSIONS');
  });
});
