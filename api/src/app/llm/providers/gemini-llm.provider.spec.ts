import { GatewayTimeoutException } from '@nestjs/common';
import type { GoogleGenAI } from '@google/genai';
import type { LlmStreamEvent } from '../../../core/llm-provider.js';
import { GeminiLlmProvider } from './gemini-llm.provider.js';

const MODEL = 'gemini-3.1-flash-lite';
const TIMEOUT_MS = 30000;
const REQUEST = {
  model: MODEL,
  system: 'Write SQL.',
  user: '<question>\nflats\n</question>',
  maxTokens: 256,
  timeoutMs: TIMEOUT_MS,
  temperature: null,
};

function providerWith(generateContent: ReturnType<typeof vi.fn>): GeminiLlmProvider {
  const client = { models: { generateContent } } as unknown as Pick<GoogleGenAI, 'models'>;
  return new GeminiLlmProvider(client);
}

describe('GeminiLlmProvider', () => {
  it('sends the instructions apart from the user turn, with the token cap and a timeout signal', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'SELECT 1' });

    await providerWith(generateContent).complete(REQUEST);

    expect(generateContent).toHaveBeenCalledWith({
      model: MODEL,
      contents: '<question>\nflats\n</question>',
      config: {
        systemInstruction: 'Write SQL.',
        maxOutputTokens: 256,
        abortSignal: expect.any(AbortSignal) as AbortSignal,
      },
    });
  });

  it.each([0, 0.7])('sends a temperature of %s when the request sets one', async (temperature) => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'SELECT 1' });

    await providerWith(generateContent).complete({ ...REQUEST, temperature });

    expect(generateContent.mock.calls[0][0]).toMatchObject({ config: { temperature } });
  });

  it('leaves the temperature to the provider when the request sets none', async () => {
    const generateContent = vi.fn().mockResolvedValue({ text: 'SELECT 1' });

    await providerWith(generateContent).complete(REQUEST);

    expect(generateContent.mock.calls[0][0]).not.toHaveProperty('config.temperature');
  });

  it('reads the text, the finish reason and the billed tokens back', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: 'SELECT id FROM properties',
      modelVersion: MODEL,
      candidates: [{ finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 12, thoughtsTokenCount: 30 },
    });

    await expect(providerWith(generateContent).complete(REQUEST)).resolves.toEqual({
      text: 'SELECT id FROM properties',
      model: MODEL,
      inputTokens: 40,
      outputTokens: 42,
      stopReason: 'STOP',
    });
  });

  it('reports an empty answer and zero usage rather than undefined', async () => {
    const generateContent = vi.fn().mockResolvedValue({});

    await expect(providerWith(generateContent).complete(REQUEST)).resolves.toEqual({
      text: '',
      model: MODEL,
      inputTokens: 0,
      outputTokens: 0,
      stopReason: null,
    });
  });

  it('turns a call that outlives the timeout into a 504 naming the model', async () => {
    const generateContent = vi.fn(
      ({ config }: { config: { abortSignal: AbortSignal } }) =>
        new Promise((_resolve, reject) => {
          config.abortSignal.addEventListener('abort', () => {
            reject(new Error('This operation was aborted'));
          });
        }),
    );

    const call = providerWith(generateContent).complete({ ...REQUEST, timeoutMs: 5 });

    await expect(call).rejects.toBeInstanceOf(GatewayTimeoutException);
    await expect(call).rejects.toThrow('Model gemini-3.1-flash-lite did not answer in time');
  });

  it('lets any other SDK error through unchanged', async () => {
    const error = new Error('API key not valid');
    const generateContent = vi.fn().mockRejectedValue(error);

    await expect(providerWith(generateContent).complete(REQUEST)).rejects.toBe(error);
  });

  describe('streaming', () => {
    function streamingWith(generateContentStream: ReturnType<typeof vi.fn>): GeminiLlmProvider {
      const client = { models: { generateContentStream } } as unknown as Pick<
        GoogleGenAI,
        'models'
      >;
      return new GeminiLlmProvider(client);
    }

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
      const generateContentStream = vi.fn().mockResolvedValue(source());

      await collect(streamingWith(generateContentStream).stream(REQUEST));

      expect(generateContentStream).toHaveBeenCalledWith({
        model: MODEL,
        contents: '<question>\nflats\n</question>',
        config: {
          systemInstruction: 'Write SQL.',
          maxOutputTokens: 256,
          abortSignal: expect.any(AbortSignal) as AbortSignal,
        },
      });
    });

    it('passes each piece of text on, then ends with the whole reply and the last running totals', async () => {
      const generateContentStream = vi.fn().mockResolvedValue(
        source(
          { text: 'Two flats ', usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 3 } },
          {
            text: 'match [P-3501].',
            modelVersion: MODEL,
            candidates: [{ finishReason: 'STOP' }],
            usageMetadata: {
              promptTokenCount: 40,
              candidatesTokenCount: 9,
              thoughtsTokenCount: 30,
            },
          },
        ),
      );

      await expect(collect(streamingWith(generateContentStream).stream(REQUEST))).resolves.toEqual([
        { kind: 'text', text: 'Two flats ' },
        { kind: 'text', text: 'match [P-3501].' },
        {
          kind: 'end',
          completion: {
            text: 'Two flats match [P-3501].',
            model: MODEL,
            inputTokens: 40,
            outputTokens: 39,
            stopReason: 'STOP',
          },
        },
      ]);
    });

    it('skips a chunk with no text, such as one carrying only usage', async () => {
      const generateContentStream = vi
        .fn()
        .mockResolvedValue(source({ text: 'Two flats.' }, { usageMetadata: {} }));

      const seen = await collect(streamingWith(generateContentStream).stream(REQUEST));

      expect(seen.filter((event) => event.kind === 'text')).toHaveLength(1);
    });

    it('turns a stream that never opens into a 504 naming the model', async () => {
      const generateContentStream = vi.fn(() => new Promise(() => undefined));

      await expect(
        collect(streamingWith(generateContentStream).stream({ ...REQUEST, timeoutMs: 5 })),
      ).rejects.toBeInstanceOf(GatewayTimeoutException);
    });
  });
});
