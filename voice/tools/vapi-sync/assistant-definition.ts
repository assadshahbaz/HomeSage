import * as z from 'zod';
import { TOOL_DEFINITIONS } from '../../src/app/agent-tools/tool-definitions.ts';
import type { SyncEnv } from './sync-env.ts';

/** Vapi's ceiling for one tool call; HomeSage usually answers well inside it. */
const TOOL_TIMEOUT_SECONDS = 20;
const MAX_CALL_SECONDS = 900;
const MODEL_TEMPERATURE = 0.3;
const WEBHOOK_PATH = '/vapi/webhook';
const JSON_INDENT = 2;

const TRANSFER_RULE =
  ', or the matter is urgent, tell them you will put them through, then call transferCall.';
const NO_TRANSFER_RULE =
  ', explain that no one can take the call live right now and take a message with take_message.';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type JsonObject = Record<string, Json>;

/** Fills the prompt's placeholders, and refuses to send one that still has any. */
export function renderSystemPrompt(template: string, env: SyncEnv): string {
  const prompt = template
    .replaceAll('{AGENCY_NAME}', env.AGENCY_NAME)
    .replaceAll(
      '{TRANSFER_RULE}',
      env.TRANSFER_PHONE_NUMBER === undefined ? NO_TRANSFER_RULE : TRANSFER_RULE,
    );
  const leftover = /\{[A-Z_]+\}/.exec(prompt);
  if (leftover !== null) {
    throw new Error(`The system prompt still has a placeholder: ${leftover[0]}`);
  }
  return prompt;
}

/**
 * The assistant as Vapi's API takes it: the model with the prompt and every
 * tool from the shared definitions, the webhook for tool calls and end of call
 * reports, and a transfer to the office when a number is set. The webhook
 * secret goes through a Vapi credential when one is named, otherwise as an
 * `X-Vapi-Secret` header.
 */
export function buildAssistant(env: SyncEnv, systemPrompt: string): JsonObject {
  const server = webhookServer(env);
  const tools: Json[] = TOOL_DEFINITIONS.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: toParameters(tool.args),
    },
    server,
    messages: [{ type: 'request-start', content: tool.holdingLine }],
  }));
  if (env.TRANSFER_PHONE_NUMBER !== undefined) {
    tools.push({
      type: 'transferCall',
      destinations: [
        {
          type: 'number',
          number: env.TRANSFER_PHONE_NUMBER,
          message: 'Putting you through to the team now.',
          description: 'The office, for a caller who asks for a person or has an urgent problem.',
        },
      ],
    });
  }
  tools.push({ type: 'endCall' });

  const assistant: JsonObject = {
    name: env.VAPI_ASSISTANT_NAME,
    firstMessage: `Hello, thanks for calling ${env.AGENCY_NAME}. You're speaking to our AI assistant, and calls may be recorded. How can I help today?`,
    model: {
      provider: env.VAPI_MODEL_PROVIDER,
      model: env.VAPI_MODEL,
      temperature: MODEL_TEMPERATURE,
      messages: [{ role: 'system', content: systemPrompt }],
      tools,
    },
    server,
    serverMessages: ['tool-calls', 'end-of-call-report'],
    maxDurationSeconds: MAX_CALL_SECONDS,
  };
  if (env.VAPI_VOICE_PROVIDER !== undefined && env.VAPI_VOICE_ID !== undefined) {
    assistant['voice'] = { provider: env.VAPI_VOICE_PROVIDER, voiceId: env.VAPI_VOICE_ID };
  }
  return assistant;
}

function webhookServer(env: SyncEnv): JsonObject {
  const server: JsonObject = {
    url: `${env.PUBLIC_URL}${WEBHOOK_PATH}`,
    timeoutSeconds: TOOL_TIMEOUT_SECONDS,
  };
  if (env.VAPI_CREDENTIAL_ID === undefined) {
    server['headers'] = { 'X-Vapi-Secret': env.VOICE_WEBHOOK_SECRET };
  } else {
    server['credentialId'] = env.VAPI_CREDENTIAL_ID;
  }
  return server;
}

/** The tool's arguments as plain JSON Schema, which is what the model is given. */
function toParameters(schema: z.ZodType): Json {
  const parameters: Record<string, unknown> = { ...z.toJSONSchema(schema, { io: 'input' }) };
  // Vapi passes this on to the model provider, which takes the schema without its dialect line.
  delete parameters['$schema'];
  return JSON.parse(JSON.stringify(parameters)) as Json;
}

/** The assistant with the webhook secret masked, for printing. */
export function redacted(assistant: JsonObject, secret: string): string {
  return JSON.stringify(assistant, null, JSON_INDENT).replaceAll(secret, '••••••••');
}
