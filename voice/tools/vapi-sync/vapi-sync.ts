import { readFileSync } from 'node:fs';
import * as z from 'zod';
import { buildAssistant, redacted, renderSystemPrompt } from './assistant-definition.ts';
import { parseSyncEnv } from './sync-env.ts';

// Creates the Vapi assistant, or updates the one with the same name, from the
// prompt in assistant/ and the tool definitions the server uses. Run it again
// after changing either. `--dry-run` prints what would be sent and calls nothing.

const VAPI_API = 'https://api.vapi.ai';
const REQUEST_TIMEOUT_MS = 20_000;

const assistantListSchema = z.array(
  z.object({ id: z.string(), name: z.string().nullish() }).loose(),
);
const assistantSchema = z.object({ id: z.string() }).loose();

async function main(): Promise<void> {
  const env = parseSyncEnv(process.env);
  const template = readFileSync(
    new URL('../../assistant/system-prompt.md', import.meta.url),
    'utf8',
  );
  const assistant = buildAssistant(env, renderSystemPrompt(template, env));

  if (process.argv.includes('--dry-run')) {
    console.log(redacted(assistant, env.VOICE_WEBHOOK_SECRET));
    return;
  }

  const headers = {
    Authorization: `Bearer ${env.VAPI_API_KEY}`,
    'Content-Type': 'application/json',
  };
  const existing = assistantListSchema
    .parse(await call(`${VAPI_API}/assistant?limit=100`, { headers }))
    .find((candidate) => candidate.name === env.VAPI_ASSISTANT_NAME);

  const saved = assistantSchema.parse(
    existing === undefined
      ? await call(`${VAPI_API}/assistant`, {
          method: 'POST',
          headers,
          body: JSON.stringify(assistant),
        })
      : await call(`${VAPI_API}/assistant/${existing.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(assistant),
        }),
  );

  console.log(
    `${existing === undefined ? 'Created' : 'Updated'} assistant "${env.VAPI_ASSISTANT_NAME}" (${saved.id}).`,
  );
  console.log(`Tool calls and call reports go to ${env.PUBLIC_URL}/vapi/webhook.`);
  console.log(
    'Next: attach it to a phone number in the Vapi dashboard, or use "Talk to Assistant" to test.',
  );
}

async function call(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Vapi answered ${response.status} for ${init.method ?? 'GET'} ${url}: ${text}`);
  }
  return JSON.parse(text);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
