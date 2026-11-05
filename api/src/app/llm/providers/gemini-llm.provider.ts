import { GoogleGenAI } from '@google/genai';
import type { GenerateContentParameters, GenerateContentResponse } from '@google/genai';
import type {
  LlmCompletion,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
} from '../../../core/llm-provider.js';
import type { LlmConfig } from '../../../infra/config/llm.config.js';
import { streamWithinDeadline } from './model-stream-timeout.js';
import { withModelTimeout } from './model-timeout.js';

/**
 * Calls Gemini through Google's `@google/genai` SDK directly. The only file in
 * the API that imports the SDK for chat; tests hand the constructor a stub client.
 */
export class GeminiLlmProvider implements LlmProvider {
  public constructor(private readonly client: Pick<GoogleGenAI, 'models'>) {}

  /** Builds the adapter from the `llm` config, with the SDK retrying inside each call's timeout. */
  public static fromConfig(config: LlmConfig): GeminiLlmProvider {
    const client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: { retryOptions: { attempts: config.maxAttempts } },
    });
    return new GeminiLlmProvider(client);
  }

  public async complete(request: LlmRequest): Promise<LlmCompletion> {
    const response = await withModelTimeout(request.model, request.timeoutMs, (signal) =>
      this.client.models.generateContent(params(request, signal)),
    );

    return {
      text: response.text ?? '',
      model: response.modelVersion ?? request.model,
      ...billed(response),
      stopReason: response.candidates?.[0]?.finishReason ?? null,
    };
  }

  public async *stream(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const chunks = streamWithinDeadline(request.model, request.timeoutMs, (signal) =>
      this.client.models.generateContentStream(params(request, signal)),
    );
    let text = '';
    let model = request.model;
    let tokens = { inputTokens: 0, outputTokens: 0 };
    let stopReason: string | null = null;

    for await (const chunk of chunks) {
      model = chunk.modelVersion ?? model;
      stopReason = chunk.candidates?.[0]?.finishReason ?? stopReason;
      // Each chunk carries the running totals, so the last one is the bill.
      if (chunk.usageMetadata) {
        tokens = billed(chunk);
      }
      const piece = chunk.text ?? '';
      if (piece !== '') {
        text += piece;
        yield { kind: 'text', text: piece };
      }
    }
    yield { kind: 'end', completion: { text, model, ...tokens, stopReason } };
  }
}

function params(request: LlmRequest, signal: AbortSignal): GenerateContentParameters {
  return {
    model: request.model,
    contents: request.user,
    config: {
      systemInstruction: request.system,
      maxOutputTokens: request.maxTokens,
      ...(request.temperature === null ? {} : { temperature: request.temperature }),
      abortSignal: signal,
    },
  };
}

function billed(response: GenerateContentResponse): { inputTokens: number; outputTokens: number } {
  const usage = response.usageMetadata;
  return {
    inputTokens: usage?.promptTokenCount ?? 0,
    // Thinking tokens are billed as output, so they count towards the cost.
    outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  };
}
