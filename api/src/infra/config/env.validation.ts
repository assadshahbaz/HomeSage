import { z } from 'zod';

const DEFAULT_PORT = 3000;
const DEFAULT_MYSQL_PORT = 3306;
const DEFAULT_ES_URL = 'http://127.0.0.1:9200';
const DEFAULT_ES_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_ES_INDEX = 'homesage-properties';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 500;
const DEFAULT_THROTTLE_LIMIT = 20;
const DEFAULT_THROTTLE_WINDOW_MS = 60_000;
const DEFAULT_LLM_TIMEOUT_MS = 30_000;
const DEFAULT_LLM_ROUTER_TIMEOUT_MS = 5_000;
const DEFAULT_LLM_ROUTER_TEMPERATURE = 0;
const MAX_LLM_TEMPERATURE = 2;
const DEFAULT_LLM_MAX_ATTEMPTS = 3;
const DEFAULT_EMBED_BATCH_SIZE = 100;
const DEFAULT_EMBED_TIMEOUT_MS = 30_000;
const DEFAULT_EMBED_MAX_ATTEMPTS = 3;
const DEFAULT_SQL_ROW_LIMIT = 50;
const DEFAULT_SQL_STATEMENT_TIMEOUT_MS = 5_000;
const DEFAULT_RETRIEVAL_BRANCH_TIMEOUT_MS = 15_000;

// A required number, piped through a string first so a missing value reads as
// missing rather than as the NaN that coercing undefined produces.
const requiredNumber = z.string().min(1).transform(Number);

// An optional string. A line left blank in .env, such as `EMBED_API_KEY=`, reads
// as unset rather than as an empty value.
function blankAsUnset<T extends z.ZodType>(schema: T): z.ZodPreprocess<z.ZodOptional<T>> {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

/**
 * Every environment variable the API reads. Parsed once at boot so a missing or
 * malformed value stops the process, rather than surfacing as a connection
 * failure on the first request that needs it.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    MYSQL_HOST: z.string().min(1).default('127.0.0.1'),
    MYSQL_PORT: z.coerce.number().int().positive().default(DEFAULT_MYSQL_PORT),
    MYSQL_DATABASE: z.string().min(1).default('homesage'),
    // No default and no fallback to root: the API only ever holds the read only account.
    MYSQL_RO_USER: z.string().min(1),
    MYSQL_RO_PASSWORD: z.string().min(1),

    ES_URL: z.url().default(DEFAULT_ES_URL),
    ES_REQUEST_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_ES_REQUEST_TIMEOUT_MS),
    // Elasticsearch index names are lower case and cannot start with a dash, underscore or plus.
    ES_INDEX: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]*$/)
      .default(DEFAULT_ES_INDEX),

    REDIS_URL: z.url().default(DEFAULT_REDIS_URL),
    // Bounds every Redis command, including one queued while the socket reconnects.
    REDIS_COMMAND_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_REDIS_COMMAND_TIMEOUT_MS),

    // Requests one IP may make to a throttled endpoint within one window.
    THROTTLE_LIMIT: z.coerce.number().int().positive().default(DEFAULT_THROTTLE_LIMIT),
    THROTTLE_WINDOW_MS: z.coerce.number().int().positive().default(DEFAULT_THROTTLE_WINDOW_MS),

    // Vendor, models and prices have no defaults, so no model vendor is named in
    // code. The provider name is checked against the registered adapters at boot.
    LLM_PROVIDER: z.string().min(1),
    LLM_API_KEY: z.string().min(1),
    // The cheap model routes and judges, the strong one writes the answer.
    LLM_ROUTER_MODEL: z.string().min(1),
    LLM_ANSWER_MODEL: z.string().min(1),
    // List prices in US dollars per million tokens, so each call's cost is computed.
    LLM_ROUTER_INPUT_USD_PER_MILLION: requiredNumber.pipe(z.number().nonnegative()),
    LLM_ROUTER_OUTPUT_USD_PER_MILLION: requiredNumber.pipe(z.number().nonnegative()),
    LLM_ANSWER_INPUT_USD_PER_MILLION: requiredNumber.pipe(z.number().nonnegative()),
    LLM_ANSWER_OUTPUT_USD_PER_MILLION: requiredNumber.pipe(z.number().nonnegative()),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_LLM_TIMEOUT_MS),
    // The router runs before anything can stream, so it gets a shorter deadline
    // than the answer and falls back to hybrid when it misses it.
    LLM_ROUTER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_LLM_ROUTER_TIMEOUT_MS),
    // The router classifies, so it samples greedily: the same question gets the
    // same route, and eval runs of two prompt versions can be compared.
    LLM_ROUTER_TEMPERATURE: z.coerce
      .number()
      .min(0)
      .max(MAX_LLM_TEMPERATURE)
      .default(DEFAULT_LLM_ROUTER_TEMPERATURE),
    // Attempts per call, the first one included. Retries on rate limits and
    // server errors, all inside the one timeout.
    LLM_MAX_ATTEMPTS: z.coerce.number().int().positive().default(DEFAULT_LLM_MAX_ATTEMPTS),

    // Like the LLM settings, the vendor and its price have no defaults, so no
    // vendor is named in code. The name is checked against the registered adapters at boot.
    EMBED_PROVIDER: z.string().min(1),
    // Each adapter checks for what it needs at boot: a hosted vendor a key, a
    // local model its server's URL.
    EMBED_API_KEY: blankAsUnset(z.string()),
    EMBED_BASE_URL: blankAsUnset(z.url()),
    // Text some models expect before each document or query, such as
    // "search_document:". Joined to the text with one space. Unset adds nothing.
    EMBED_DOCUMENT_PREFIX: blankAsUnset(z.string()),
    EMBED_QUERY_PREFIX: blankAsUnset(z.string()),
    // Model and dimensions have no defaults because they have to agree with each
    // other and with the index mapping. A wrong guess here is a silent rebuild.
    EMBED_MODEL: z.string().min(1),
    EMBED_DIMENSIONS: requiredNumber.pipe(z.number().int().positive()),
    EMBED_BATCH_SIZE: z.coerce.number().int().positive().default(DEFAULT_EMBED_BATCH_SIZE),
    EMBED_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_EMBED_TIMEOUT_MS),
    // Attempts per batch, the first one included, all inside EMBED_TIMEOUT_MS.
    EMBED_MAX_ATTEMPTS: z.coerce.number().int().positive().default(DEFAULT_EMBED_MAX_ATTEMPTS),
    // Texts the account may embed a minute, for a vendor that counts each text in
    // a batch as a request. Unset means no pacing.
    EMBED_TEXTS_PER_MINUTE: z.coerce.number().int().positive().optional(),
    // List price in US dollars per million input tokens. Embeddings bill no output.
    EMBED_INPUT_USD_PER_MILLION: requiredNumber.pipe(z.number().nonnegative()),

    // The most rows a generated query may return. The validator adds or lowers LIMIT to this.
    SQL_ROW_LIMIT: z.coerce.number().int().positive().default(DEFAULT_SQL_ROW_LIMIT),
    // MySQL stops a generated query that runs longer than this, rather than the request hanging.
    SQL_STATEMENT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_SQL_STATEMENT_TIMEOUT_MS),

    // Each retrieval branch (SQL, kNN, BM25) answers inside this or is left out
    // of the fusion. The SQL branch holds a model call and maybe its correction.
    RETRIEVAL_BRANCH_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_RETRIEVAL_BRANCH_TIMEOUT_MS),
  })
  .refine((env) => env.LLM_ROUTER_TIMEOUT_MS < env.LLM_TIMEOUT_MS, {
    message: 'LLM_ROUTER_TIMEOUT_MS must be below LLM_TIMEOUT_MS',
    path: ['LLM_ROUTER_TIMEOUT_MS'],
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the raw environment and returns it coerced. `ConfigModule` calls
 * this at boot, and each config factory calls it again because Nest only ever
 * writes strings back to `process.env`.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
}
