import type { Provider } from '@angular/core';
import { InjectionToken } from '@angular/core';
// A namespace import lets the bundler drop unused zod code; `{ z }` keeps all of it.
import * as z from 'zod';

/** Where the runtime config is served from, relative to the base href. */
export const RUNTIME_CONFIG_PATH = 'config.json';

const DEFAULT_API_BASE_URL = '/api';

// A protocol relative `//host` would send requests to whatever host it names.
const isSameOriginPath = (value: string): boolean =>
  value.startsWith('/') && !value.startsWith('//');
const isHttpUrl = (value: string): boolean => /^https?:\/\/[^/]/i.test(value);

const runtimeConfigSchema = z.strictObject({
  apiBaseUrl: z
    .string()
    .trim()
    .refine((value) => isSameOriginPath(value) || isHttpUrl(value), {
      message: 'must be a path starting with / or an http(s) URL',
    })
    .transform((value) => value.replace(/\/+$/, ''))
    .default(DEFAULT_API_BASE_URL),
});

/** Values that differ per deploy and are read once, before the app starts. */
export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export const RUNTIME_CONFIG = new InjectionToken<RuntimeConfig>('RUNTIME_CONFIG');

/**
 * Parses the text of `config.json`. Throws with a message naming the bad field,
 * so a broken deploy fails at startup instead of on the first API call.
 */
export function parseRuntimeConfig(text: string): RuntimeConfig {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`${RUNTIME_CONFIG_PATH} is not valid JSON`, { cause: error });
  }

  const result = runtimeConfigSchema.safeParse(json);
  if (!result.success) {
    throw new Error(`${RUNTIME_CONFIG_PATH} is invalid:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** Makes the parsed config injectable through `RUNTIME_CONFIG`. */
export function provideRuntimeConfig(config: RuntimeConfig): Provider {
  return { provide: RUNTIME_CONFIG, useValue: config };
}
