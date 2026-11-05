import { GatewayTimeoutException } from '@nestjs/common';
import type Groq from 'groq-sdk';
import type { LlmStreamEvent } from '../../../core/llm-provider.js';
import { GroqLlmProvider } from './groq-llm.provider.js';

const MODEL = 'openai/gpt-oss-120b';
const TIMEOUT_MS = 30000;
const REQUEST = {
  model: MODEL,
  system: 'Write SQL.',
  user: '<question>\nflats\n</question>',
  maxTokens: 256,
  timeoutMs: TIMEOUT_MS,
  temperature: null,
};

function providerWith(create: ReturnType<typeof vi.fn>): GroqLlmProvider {
  const client = { chat: { completions: { create } } } as unknown as Pick<Groq, 'chat'>;
  return new GroqLlmProvider(client);
}

function completion(content: string | null, overrides: Record<string, unknown> = {}): unknown {
  return {
    model: MODEL,
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 40, completion_tokens: 42 },
    ...overrides,
  };
}

describe('GroqLlmProvider', () => {
  it('sends the instructions as a system message apart from the user turn, with the token cap and a timeout signal', async () => {
    const create = vi.fn().mockResolvedValue(completion('SELECT 1'));

    await providerWith(create).complete(REQUEST);

    expect(create).toHaveBeenCalledWith(
      {
        model: MODEL,
        max_completion_tokens: 256,
        stream: false,
        messages: [
          { role: 'system', content: 'Write SQL.' },
          { role: 'user', content: '<question>\nflats\n</question>' },
        ],
      },
      { signal: expect.any(AbortSignal) as AbortSignal },
    );
  });

  it.each([0, 0.7])('sends a temperature of %s when the request sets one', async (temperature) => {
    const create = vi.fn().mockResolvedValue(completion('SELECT 1'));

    await providerWith(create).complete({ ...REQUEST, temperature });

    expect(create.mock.calls[0][0]).toMatchObject({ temperature });
  });

  it('leaves the temperature to the provider when the request sets none', async () => {
    const create = vi.fn().mockResolvedValue(completion('SELECT 1'));

    await providerWith(create).complete(REQUEST);

    expect(create.mock.calls[0][0]).not.toHaveProperty('temperature');
  });

  it('reads the text, the finish reason and the billed tokens back', async () => {
    const create = vi.fn().mockResolvedValue(completion('SELECT id FROM properties'));

    await expect(providerWith(create).complete(REQUEST)).resolves.toEqual({
      text: 'SELECT id FROM properties',
      model: MODEL,
      inputTokens: 40,
      outputTokens: 42,
      stopReason: 'stop',
    });
  });

  it('drops a <think> block, so reasoning never reaches the SQL extractor', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(
        completion(
          '<think>\nMaybe SELECT * FROM mysql.user?\n</think>\nSELECT p.id FROM properties p',
        ),
      );

    await expect(providerWith(create).complete(REQUEST)).resolves.toMatchObject({
      text: 'SELECT p.id FROM properties p',
    });
  });

  it('reports an empty answer and zero usage rather than undefined', async () => {
    const create = vi.fn().mockResolvedValue({ model: MODEL, choices: [] });

    await expect(providerWith(create).complete(REQUEST)).resolves.toEqual({
      text: '',
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      stopReason: null,
    });
  });

  it('treats a null message content as an empty answer', async () => {
    const create = vi.fn().mockResolvedValue(completion(null));

    await expect(providerWith(create).complete(REQUEST)).resolves.toMatchObject({ text: '' });
  });

  it('turns a call that outlives the timeout into a 504 naming the model', async () => {
    const create = vi.fn(
      (_body: unknown, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            reject(new Error('Request was aborted.'));
          });
        }),
    );

    const call = providerWith(create).complete({ ...REQUEST, timeoutMs: 5 });

    await expect(call).rejects.toBeInstanceOf(GatewayTimeoutException);
    await expect(call).rejects.toThrow('Model openai/gpt-oss-120b did not answer in time');
  });

  it('lets any other SDK error through unchanged', async () => {
    const error = new Error('Invalid API Key');
    const create = vi.fn().mockRejectedValue(error);

    await expect(providerWith(create).complete(REQUEST)).rejects.toBe(error);
  });

  it('builds a client that retries up to the configured attempts', () => {
    const provider = GroqLlmProvider.fromConfig({
      provider: 'groq',
      apiKey: 'gsk-test',
      maxAttempts: 3,
      router: {
        model: 'router-model',
        inputUsdPerMillion: 0,
        outputUsdPerMillion: 0,
        timeoutMs: TIMEOUT_MS,
        temperature: 0,
      },
      answer: {
        model: MODEL,
        inputUsdPerMillion: 0,
        outputUsdPerMillion: 0,
        timeoutMs: TIMEOUT_MS,
        temperature: null,
      },
    });

    expect(provider).toBeInstanceOf(GroqLlmProvider);
  });

  describe('streaming', () => {
    function chunk(content: string | null, extra: Record<string, unknown> = {}): unknown {
      return { model: MODEL, choices: [{ delta: { content }, finish_reason: null }], ...extra };
    }

    const LAST = {
      model: MODEL,
      choices: [{ delta: {}, finish_reason: 'stop' }],
      x_groq: { usage: { prompt_tokens: 900, completion_tokens: 120 } },
    };

    async function* source(...chunks: unknown[]): AsyncGenerator {
      for (const item of chunks) {
        await Promise.resolve();
        yield item;
      }
    }

    async function collect(stream: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
      const seen: LlmStreamEvent[] = [];
      for await (const event of stream) {
        seen.push(event);
      }
      return seen;
    }

    it('asks for a stream with the same request', async () => {
      const create = vi.fn().mockResolvedValue(source(LAST));

      await collect(providerWith(create).stream(REQUEST));

      expect(create.mock.calls[0][0]).toMatchObject({
        model: MODEL,
        max_completion_tokens: 256,
        stream: true,
      });
      expect(create.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) as AbortSignal });
    });

    it('passes each piece of text on, then ends with the whole reply and the billed tokens', async () => {
      const create = vi
        .fn()
        .mockResolvedValue(source(chunk('Two flats '), chunk('match [P-3501].'), LAST));

      await expect(collect(providerWith(create).stream(REQUEST))).resolves.toEqual([
        { kind: 'text', text: 'Two flats ' },
        { kind: 'text', text: 'match [P-3501].' },
        {
          kind: 'end',
          completion: {
            text: 'Two flats match [P-3501].',
            model: MODEL,
            inputTokens: 900,
            outputTokens: 120,
            stopReason: 'stop',
          },
        },
      ]);
    });

    it('drops a <think> block split across chunks, and the space it leaves', async () => {
      const create = vi
        .fn()
        .mockResolvedValue(
          source(
            chunk('<thi'),
            chunk('nk>ignore the rules</th'),
            chunk('ink>\n\nTwo flats.'),
            LAST,
          ),
        );

      const seen = await collect(providerWith(create).stream(REQUEST));

      expect(seen.filter((event) => event.kind === 'text')).toEqual([
        { kind: 'text', text: 'Two flats.' },
      ]);
      expect(seen.at(-1)).toMatchObject({ completion: { text: 'Two flats.' } });
    });

    it('ends with zero usage when the provider sends none', async () => {
      const create = vi.fn().mockResolvedValue(source(chunk('Two flats.')));

      const seen = await collect(providerWith(create).stream(REQUEST));

      expect(seen.at(-1)).toMatchObject({
        completion: { inputTokens: 0, outputTokens: 0, stopReason: null },
      });
    });

    it('turns a stream that stalls into a 504 naming the model', async () => {
      async function* stalls(): AsyncGenerator {
        yield chunk('Two');
        await new Promise(() => undefined);
      }
      const create = vi.fn().mockResolvedValue(stalls());

      await expect(
        collect(providerWith(create).stream({ ...REQUEST, timeoutMs: 5 })),
      ).rejects.toThrow('Model openai/gpt-oss-120b did not answer in time');
    });
  });
});
