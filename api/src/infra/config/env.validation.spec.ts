import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const REQUIRED = {
  MYSQL_RO_USER: 'rag_ro',
  MYSQL_RO_PASSWORD: 'ro-secret',
  LLM_PROVIDER: 'some-provider',
  LLM_API_KEY: 'llm-key',
  LLM_ROUTER_MODEL: 'router-model',
  LLM_ANSWER_MODEL: 'answer-model',
  LLM_ROUTER_INPUT_USD_PER_MILLION: '0.25',
  LLM_ROUTER_OUTPUT_USD_PER_MILLION: '1.5',
  LLM_ANSWER_INPUT_USD_PER_MILLION: '0.75',
  LLM_ANSWER_OUTPUT_USD_PER_MILLION: '3.75',
  EMBED_PROVIDER: 'some-provider',
  EMBED_MODEL: 'embed-model',
  EMBED_DIMENSIONS: '1536',
  EMBED_INPUT_USD_PER_MILLION: '0.2',
};

describe('validateEnv', () => {
  it('coerces the numeric variables out of their string form', () => {
    const env = validateEnv({ ...REQUIRED, PORT: '4000', MYSQL_PORT: '3307' });

    expect(env.PORT).toBe(4000);
    expect(env.MYSQL_PORT).toBe(3307);
    expect(env.EMBED_DIMENSIONS).toBe(1536);
  });

  it('falls back to the local defaults when only the required values are set', () => {
    const env = validateEnv(REQUIRED);

    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: 3306,
      MYSQL_DATABASE: 'homesage',
      ES_URL: 'http://127.0.0.1:9200',
      ES_REQUEST_TIMEOUT_MS: 5000,
      ES_INDEX: 'homesage-properties',
      REDIS_URL: 'redis://127.0.0.1:6379',
      REDIS_COMMAND_TIMEOUT_MS: 500,
      THROTTLE_LIMIT: 20,
      THROTTLE_WINDOW_MS: 60000,
      LLM_TIMEOUT_MS: 30000,
      LLM_ROUTER_TIMEOUT_MS: 5000,
      LLM_ROUTER_TEMPERATURE: 0,
      LLM_MAX_ATTEMPTS: 3,
      EMBED_BATCH_SIZE: 100,
      EMBED_TIMEOUT_MS: 30000,
      EMBED_MAX_ATTEMPTS: 3,
      SQL_ROW_LIMIT: 50,
      SQL_STATEMENT_TIMEOUT_MS: 5000,
      RETRIEVAL_BRANCH_TIMEOUT_MS: 15000,
      ...REQUIRED,
      LLM_ROUTER_INPUT_USD_PER_MILLION: 0.25,
      LLM_ROUTER_OUTPUT_USD_PER_MILLION: 1.5,
      LLM_ANSWER_INPUT_USD_PER_MILLION: 0.75,
      LLM_ANSWER_OUTPUT_USD_PER_MILLION: 3.75,
      EMBED_DIMENSIONS: 1536,
      EMBED_INPUT_USD_PER_MILLION: 0.2,
    });
  });

  it('ignores variables the API does not read', () => {
    const env = validateEnv({ ...REQUIRED, MYSQL_ROOT_PASSWORD: 'root-secret' });

    expect(env).not.toHaveProperty('MYSQL_ROOT_PASSWORD');
  });

  it.each(Object.keys(REQUIRED))('rejects a missing %s', (variable) => {
    const raw: Record<string, string> = { ...REQUIRED };
    delete raw[variable];

    expect(() => validateEnv(raw)).toThrow(variable);
  });

  it('rejects a blank host', () => {
    expect(() => validateEnv({ ...REQUIRED, MYSQL_HOST: '' })).toThrow('MYSQL_HOST');
  });

  it.each(['Homesage', '_properties', 'properties index', ''])(
    'rejects %p as an index name',
    (index) => {
      expect(() => validateEnv({ ...REQUIRED, ES_INDEX: index })).toThrow('ES_INDEX');
    },
  );

  it.each(['not-a-port', '0', '-1', '80.5'])('rejects %p as a port', (port) => {
    expect(() => validateEnv({ ...REQUIRED, PORT: port })).toThrow('PORT');
  });

  it('reads a blank optional line in .env as unset, so the example file boots as copied', () => {
    const env = validateEnv({
      ...REQUIRED,
      EMBED_API_KEY: '',
      EMBED_BASE_URL: '',
      EMBED_DOCUMENT_PREFIX: '',
      EMBED_QUERY_PREFIX: '',
    });

    expect(env.EMBED_API_KEY).toBeUndefined();
    expect(env.EMBED_BASE_URL).toBeUndefined();
    expect(env.EMBED_DOCUMENT_PREFIX).toBeUndefined();
    expect(env.EMBED_QUERY_PREFIX).toBeUndefined();
  });

  it('keeps the embedding key and prefixes as given', () => {
    const env = validateEnv({
      ...REQUIRED,
      EMBED_API_KEY: 'embed-key',
      EMBED_BASE_URL: 'http://127.0.0.1:11434',
      EMBED_DOCUMENT_PREFIX: 'search_document:',
      EMBED_QUERY_PREFIX: 'search_query:',
    });

    expect(env).toMatchObject({
      EMBED_API_KEY: 'embed-key',
      EMBED_BASE_URL: 'http://127.0.0.1:11434',
      EMBED_DOCUMENT_PREFIX: 'search_document:',
      EMBED_QUERY_PREFIX: 'search_query:',
    });
  });

  it.each([
    ['ES_URL', 'nine thousand two hundred'],
    ['REDIS_URL', '127.0.0.1:6379'],
    ['EMBED_BASE_URL', '127.0.0.1:11434'],
  ])('rejects %s when it is not a URL', (variable, value) => {
    expect(() => validateEnv({ ...REQUIRED, [variable]: value })).toThrow(variable);
  });

  it.each([
    'ES_REQUEST_TIMEOUT_MS',
    'LLM_TIMEOUT_MS',
    'LLM_ROUTER_TIMEOUT_MS',
    'LLM_ROUTER_TEMPERATURE',
    'LLM_MAX_ATTEMPTS',
    'LLM_ROUTER_INPUT_USD_PER_MILLION',
    'LLM_ANSWER_OUTPUT_USD_PER_MILLION',
    'EMBED_BATCH_SIZE',
    'EMBED_TIMEOUT_MS',
    'EMBED_DIMENSIONS',
    'EMBED_MAX_ATTEMPTS',
    'EMBED_TEXTS_PER_MINUTE',
    'EMBED_INPUT_USD_PER_MILLION',
    'SQL_ROW_LIMIT',
    'SQL_STATEMENT_TIMEOUT_MS',
    'RETRIEVAL_BRANCH_TIMEOUT_MS',
    'REDIS_COMMAND_TIMEOUT_MS',
    'THROTTLE_LIMIT',
    'THROTTLE_WINDOW_MS',
  ])('rejects a non numeric %s', (variable) => {
    expect(() => validateEnv({ ...REQUIRED, [variable]: 'soon' })).toThrow(variable);
  });

  it.each([
    ['equal to', '30000'],
    ['above', '45000'],
  ])('rejects a router timeout %s the answer timeout', (_, routerTimeout) => {
    expect(() =>
      validateEnv({ ...REQUIRED, LLM_TIMEOUT_MS: '30000', LLM_ROUTER_TIMEOUT_MS: routerTimeout }),
    ).toThrow('LLM_ROUTER_TIMEOUT_MS must be below LLM_TIMEOUT_MS');
  });

  it('rejects a default router timeout that the answer timeout has been lowered under', () => {
    expect(() => validateEnv({ ...REQUIRED, LLM_TIMEOUT_MS: '4000' })).toThrow(
      'LLM_ROUTER_TIMEOUT_MS',
    );
  });

  it.each(['-0.1', '2.1'])('rejects a router temperature of %s', (temperature) => {
    expect(() => validateEnv({ ...REQUIRED, LLM_ROUTER_TEMPERATURE: temperature })).toThrow(
      'LLM_ROUTER_TEMPERATURE',
    );
  });

  it('rejects a negative price', () => {
    expect(() => validateEnv({ ...REQUIRED, LLM_ANSWER_INPUT_USD_PER_MILLION: '-1' })).toThrow(
      'LLM_ANSWER_INPUT_USD_PER_MILLION',
    );
  });

  it('accepts a price of zero', () => {
    expect(validateEnv({ ...REQUIRED, LLM_ROUTER_INPUT_USD_PER_MILLION: '0' })).toMatchObject({
      LLM_ROUTER_INPUT_USD_PER_MILLION: 0,
    });
  });

  it('names every missing variable in one message', () => {
    expect(() => validateEnv({})).toThrow(
      /MYSQL_RO_USER[\s\S]*EMBED_PROVIDER[\s\S]*EMBED_DIMENSIONS[\s\S]*EMBED_INPUT_USD_PER_MILLION/,
    );
  });
});
