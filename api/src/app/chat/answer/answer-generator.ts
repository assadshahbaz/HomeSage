import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import type { LlmStreamEvent } from '../../../core/llm-provider.js';
import { LLM_JOB } from '../../llm/llm-job.js';
import { LlmService } from '../../llm/llm.service.js';
import { PromptLoader } from '../../llm/prompts/prompt-loader.js';
import type { HybridRetrieval } from '../../retrieval/hybrid-retrieval.service.js';
import { renderAnswerContext } from './answer-context.js';

const PROMPTS_DIRECTORY = fileURLToPath(new URL('./prompts/', import.meta.url));
const ANSWER_PROMPT = { name: 'answer', version: 1 } as const;

// The cap covers a reasoning model's thinking as well as the answer, and an
// answer about eight homes runs to a few hundred tokens.
const ANSWER_MAX_TOKENS = 4096;

// Invisible format characters: zero width spaces and joiners, the byte order
// mark and bidi controls. A model has been seen writing a zero width space
// inside a marker, which then cites nothing.
const INVISIBLE = /\p{Cf}/gu;

// Look alikes a model writes in place of the marker's plain characters, seen
// as fullwidth brackets and a non breaking hyphen, mapped back to them. The
// dashes used in prose are left alone.
const LEFT_LENTICULAR_BRACKET = 0x3010;
const RIGHT_LENTICULAR_BRACKET = 0x3011;
const FULLWIDTH_LEFT_BRACKET = 0xff3b;
const FULLWIDTH_RIGHT_BRACKET = 0xff3d;
const HYPHEN = 0x2010;
const NON_BREAKING_HYPHEN = 0x2011;
const LOOKALIKES = new Map(
  (
    [
      [LEFT_LENTICULAR_BRACKET, '['],
      [RIGHT_LENTICULAR_BRACKET, ']'],
      [FULLWIDTH_LEFT_BRACKET, '['],
      [FULLWIDTH_RIGHT_BRACKET, ']'],
      [HYPHEN, '-'],
      [NON_BREAKING_HYPHEN, '-'],
    ] as const
  ).map(([code, plain]) => [String.fromCharCode(code), plain]),
);
const LOOKALIKE = new RegExp(`[${[...LOOKALIKES.keys()].join('')}]`, 'g');

/**
 * Writes the answer to a question from what retrieval found and nothing else,
 * citing each fact as `[P-1234]` or `[SQL]`. The answer streams as plain text,
 * ending with the provider's end event, which carries the whole text and the
 * tokens it cost. Nothing here checks the citations: the citation guard does.
 */
@Injectable()
export class AnswerGenerator {
  public constructor(
    private readonly llm: LlmService,
    private readonly prompts: PromptLoader,
  ) {}

  /** Streams the answer to `question`, asked as it stands alone, over `retrieval`. */
  public async *stream(
    question: string,
    retrieval: HybridRetrieval,
  ): AsyncGenerator<LlmStreamEvent> {
    const prompt = await this.prompts.load(
      PROMPTS_DIRECTORY,
      ANSWER_PROMPT.name,
      ANSWER_PROMPT.version,
    );
    const events = this.llm.stream({
      job: LLM_JOB.ANSWER,
      prompt,
      data: { question, context: renderAnswerContext(retrieval) },
      maxTokens: ANSWER_MAX_TOKENS,
    });
    for await (const event of events) {
      if (event.kind === 'end') {
        yield {
          kind: 'end',
          completion: { ...event.completion, text: plainMarkers(event.completion.text) },
        };
        continue;
      }
      const text = plainMarkers(event.text);
      if (text !== '') {
        yield { kind: 'text', text };
      }
    }
  }
}

/**
 * The text with invisible characters removed and look alike brackets and
 * hyphens made plain, so every marker the model meant reads as one. Each is a
 * single character, so this is safe chunk by chunk.
 */
function plainMarkers(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .replace(LOOKALIKE, (character) => LOOKALIKES.get(character) ?? character);
}
