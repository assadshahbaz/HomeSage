import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  LlmCompletion,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
} from '../../core/llm-provider.js';
import type { LlmConfig, LlmJobConfig } from '../../infra/config/llm.config.js';
import { AppLogger } from '../../platform/logging/app-logger.js';
import { LLM_JOB } from './llm-job.js';
import type { LlmJob } from './llm-job.js';
import { costUsd } from './llm-cost.js';
import { renderPromptData } from './prompts/prompt-data.js';
import type { Prompt } from './prompts/prompt-loader.js';
import { LLM_PROVIDER } from './llm.symbol.js';

// Enough precision for a fraction of a cent, without float noise in the logs.
const COST_DECIMALS = 6;

/** One model call, described by what it is for rather than which model serves it. */
export interface LlmCall {
  readonly job: LlmJob;
  readonly prompt: Prompt;
  /** Questions and retrieved text, each placed in its own delimited block of the user turn. */
  readonly data: Readonly<Record<string, string>>;
  readonly maxTokens: number;
}

/**
 * The one door to a model. Picks the model for the job from config, keeps the
 * prompt's instructions apart from the data, and logs what every call cost.
 */
@Injectable()
export class LlmService {
  private readonly jobs: Readonly<Record<LlmJob, LlmJobConfig>>;

  public constructor(
    @Inject(LLM_PROVIDER) private readonly provider: LlmProvider,
    configService: ConfigService,
    private readonly logger: AppLogger,
  ) {
    const { router, answer } = configService.getOrThrow<LlmConfig>('llm');
    this.jobs = { [LLM_JOB.ROUTER]: router, [LLM_JOB.ANSWER]: answer };
  }

  /** Sends one prompt to the model for `job` and logs model, tokens, latency and cost. */
  public async complete(call: LlmCall): Promise<LlmCompletion> {
    const { job, request } = this.request(call);
    const startedAt = Date.now();
    const completion = await this.provider.complete(request);
    this.logCall(call, job, completion, startedAt);
    return completion;
  }

  /**
   * Streams one prompt's reply for `job`, ending with the provider's end
   * event, and logs the call the same way once that event arrives.
   */
  public async *stream(call: LlmCall): AsyncGenerator<LlmStreamEvent> {
    const { job, request } = this.request(call);
    const startedAt = Date.now();
    for await (const event of this.provider.stream(request)) {
      yield event;
      if (event.kind === 'end') {
        this.logCall(call, job, event.completion, startedAt);
        return;
      }
    }
    throw new Error(`Model ${request.model} stream ended without its token counts`);
  }

  private request(call: LlmCall): { job: LlmJobConfig; request: LlmRequest } {
    const job = this.jobs[call.job];
    return {
      job,
      request: {
        model: job.model,
        system: call.prompt.text,
        user: renderPromptData(call.data),
        maxTokens: call.maxTokens,
        timeoutMs: job.timeoutMs,
        temperature: job.temperature,
      },
    };
  }

  private logCall(
    call: LlmCall,
    job: LlmJobConfig,
    completion: LlmCompletion,
    startedAt: number,
  ): void {
    const prompt = `${call.prompt.name}.v${String(call.prompt.version)}`;
    this.logger.log(
      `llm ${call.job} ${job.model} ${prompt}`,
      {
        job: call.job,
        model: job.model,
        prompt,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
        latencyMs: Date.now() - startedAt,
        costUsd: Number(
          costUsd(job, completion.inputTokens, completion.outputTokens).toFixed(COST_DECIMALS),
        ),
        stopReason: completion.stopReason,
      },
      LlmService.name,
    );
  }
}
