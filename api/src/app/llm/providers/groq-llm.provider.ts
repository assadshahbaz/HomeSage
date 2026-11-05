import Groq from 'groq-sdk';
import type { ChatCompletionCreateParamsBase } from 'groq-sdk/resources/chat/completions';
import type {
  LlmCompletion,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
} from '../../../core/llm-provider.js';
import type { LlmConfig } from '../../../infra/config/llm.config.js';
import { streamWithinDeadline } from './model-stream-timeout.js';
import { withModelTimeout } from './model-timeout.js';
import { ThinkBlockFilter } from './think-block-filter.js';

// Some reasoning models put their thinking in the reply as a <think> block
// before the answer. It is never part of the answer, and SQL written inside it
// must not reach the extractor.
const THINK_BLOCK = /<think>[\s\S]*?<\/think>/g;

/**
 * Calls Groq through its `groq-sdk` directly. The only file in the API that
 * imports the SDK; tests hand the constructor a stub client.
 */
export class GroqLlmProvider implements LlmProvider {
  public constructor(private readonly client: Pick<Groq, 'chat'>) {}

  /** Builds the adapter from the `llm` config, with the SDK retrying inside each call's timeout. */
  public static fromConfig(config: LlmConfig): GroqLlmProvider {
    const client = new Groq({ apiKey: config.apiKey, maxRetries: config.maxAttempts - 1 });
    return new GroqLlmProvider(client);
  }

  public async complete(request: LlmRequest): Promise<LlmCompletion> {
    const completion = await withModelTimeout(request.model, request.timeoutMs, (signal) =>
      this.client.chat.completions.create(
        { ...params(request), stream: false as const },
        { signal },
      ),
    );

    // `.at` keeps the empty case visible to the compiler: a provider can return no choices.
    const choice = completion.choices.at(0);
    return {
      text: (choice?.message.content ?? '').replace(THINK_BLOCK, '').trim(),
      model: completion.model,
      // Reasoning tokens are already inside completion_tokens, which is what is billed as output.
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      stopReason: choice?.finish_reason ?? null,
    };
  }

  public async *stream(request: LlmRequest): AsyncGenerator<LlmStreamEvent> {
    const chunks = streamWithinDeadline(request.model, request.timeoutMs, (signal) =>
      this.client.chat.completions.create(
        { ...params(request), stream: true as const },
        { signal },
      ),
    );
    const thinking = new ThinkBlockFilter();
    let text = '';
    let model = request.model;
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason: string | null = null;

    for await (const chunk of chunks) {
      model = chunk.model;
      const choice = chunk.choices.at(0);
      stopReason = choice?.finish_reason ?? stopReason;
      // Groq sends the billed counts once, on the last chunk.
      const usage = chunk.x_groq?.usage;
      if (usage) {
        inputTokens = usage.prompt_tokens;
        outputTokens = usage.completion_tokens;
      }
      const piece = leading(text, thinking.push(choice?.delta.content ?? ''));
      if (piece !== '') {
        text += piece;
        yield { kind: 'text', text: piece };
      }
    }
    const rest = leading(text, thinking.flush());
    if (rest !== '') {
      text += rest;
      yield { kind: 'text', text: rest };
    }
    yield { kind: 'end', completion: { text, model, inputTokens, outputTokens, stopReason } };
  }
}

function params(request: LlmRequest): ChatCompletionCreateParamsBase {
  return {
    model: request.model,
    max_completion_tokens: request.maxTokens,
    ...(request.temperature === null ? {} : { temperature: request.temperature }),
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: request.user },
    ],
  };
}

// The space a removed think block leaves before the answer is not part of it.
function leading(sent: string, piece: string): string {
  return sent === '' ? piece.trimStart() : piece;
}
