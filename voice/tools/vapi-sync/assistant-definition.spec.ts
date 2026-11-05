import { readFileSync } from 'node:fs';
import { buildAssistant, redacted, renderSystemPrompt } from './assistant-definition.ts';
import { parseSyncEnv } from './sync-env.ts';

const SECRET = 'webhook-secret-0123456789abcdef';
const BASE = {
  VAPI_API_KEY: 'key',
  PUBLIC_URL: 'https://voice.example.ngrok.app/',
  VOICE_WEBHOOK_SECRET: SECRET,
};
const TEMPLATE = readFileSync(new URL('../../assistant/system-prompt.md', import.meta.url), 'utf8');

interface ToolShape {
  type: string;
  function?: { name: string; parameters: Record<string, unknown> };
  server?: Record<string, unknown>;
}

function toolsOf(assistant: Record<string, unknown>): ToolShape[] {
  return (assistant['model'] as { tools: ToolShape[] }).tools;
}

describe('buildAssistant', () => {
  it('sends every tool to the webhook with the secret as a header by default', () => {
    const env = parseSyncEnv(BASE);
    const assistant = buildAssistant(env, renderSystemPrompt(TEMPLATE, env));
    const tools = toolsOf(assistant);

    expect(tools.map((tool) => tool.function?.name ?? tool.type)).toEqual([
      'search_properties',
      'get_viewing_slots',
      'book_viewing',
      'request_valuation',
      'take_message',
      'endCall',
    ]);
    expect(tools[0]?.server).toEqual({
      url: 'https://voice.example.ngrok.app/vapi/webhook',
      timeoutSeconds: 20,
      headers: { 'X-Vapi-Secret': SECRET },
    });
    expect(tools[0]?.function?.parameters).not.toHaveProperty('$schema');
    expect(assistant['serverMessages']).toEqual(['tool-calls', 'end-of-call-report']);
    expect(assistant).not.toHaveProperty('voice');
  });

  it('uses a credential instead of the header when one is named, and adds the transfer', () => {
    const env = parseSyncEnv({
      ...BASE,
      VAPI_CREDENTIAL_ID: 'cred-1',
      TRANSFER_PHONE_NUMBER: '+441632960999',
      VAPI_VOICE_PROVIDER: '11labs',
      VAPI_VOICE_ID: 'voice-1',
    });
    const prompt = renderSystemPrompt(TEMPLATE, env);
    const assistant = buildAssistant(env, prompt);
    const tools = toolsOf(assistant);

    expect(tools[0]?.server).toEqual({
      url: 'https://voice.example.ngrok.app/vapi/webhook',
      timeoutSeconds: 20,
      credentialId: 'cred-1',
    });
    expect(tools.map((tool) => tool.type)).toContain('transferCall');
    expect(prompt).toContain('then call transferCall');
    expect(assistant['voice']).toEqual({ provider: '11labs', voiceId: 'voice-1' });
  });

  it('fills the prompt and tells the agent to take a message when there is no transfer', () => {
    const env = parseSyncEnv({ ...BASE, AGENCY_NAME: 'Granite City Homes' });
    const prompt = renderSystemPrompt(TEMPLATE, env);
    expect(prompt).toContain('the phone assistant for Granite City Homes');
    expect(prompt).toContain('take a message with take_message');
    expect(prompt).not.toMatch(/\{[A-Z_]+\}/);
  });

  it('refuses a prompt with a placeholder nobody fills', () => {
    const env = parseSyncEnv(BASE);
    expect(() => renderSystemPrompt('Hello {UNKNOWN_THING}', env)).toThrow(/UNKNOWN_THING/);
  });

  it('masks the secret when printing', () => {
    const env = parseSyncEnv(BASE);
    const printed = redacted(buildAssistant(env, 'prompt'), SECRET);
    expect(printed).not.toContain(SECRET);
  });
});

describe('parseSyncEnv', () => {
  it('needs an https public URL and a voice provider with its voice', () => {
    expect(() => parseSyncEnv({ ...BASE, PUBLIC_URL: 'http://localhost:3100' })).toThrow(
      /PUBLIC_URL/,
    );
    expect(() => parseSyncEnv({ ...BASE, VAPI_VOICE_PROVIDER: '11labs' })).toThrow(/VAPI_VOICE_ID/);
    expect(() => parseSyncEnv({ ...BASE, TRANSFER_PHONE_NUMBER: '01632 960999' })).toThrow(
      /E\.164/,
    );
  });
});
