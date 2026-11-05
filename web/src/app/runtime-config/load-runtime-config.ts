import type { RuntimeConfig } from './runtime-config';
import { parseRuntimeConfig, RUNTIME_CONFIG_PATH } from './runtime-config';

/** Fetches and parses `config.json`. Rejects on a failed fetch or a bad file. */
export async function loadRuntimeConfig(fetchFn: typeof fetch): Promise<RuntimeConfig> {
  // Each deploy may replace the file without a rebuild, so never serve it from cache.
  const response = await fetchFn(RUNTIME_CONFIG_PATH, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Could not load ${RUNTIME_CONFIG_PATH}: HTTP ${response.status}`);
  }
  return parseRuntimeConfig(await response.text());
}
