import { Injectable } from '@nestjs/common';
import { chatCitationsEventSchema } from '../../../contracts/index.js';
import type { ChatCitationsEvent } from '../../../contracts/index.js';
import type { LlmCompletion } from '../../../core/llm-provider.js';
import { AppLogger } from '../../../platform/logging/app-logger.js';
import type { HybridRetrieval } from '../../retrieval/hybrid-retrieval.service.js';
import { allowedCitations } from '../citations/allowed-citations.js';
import { CitationGuard } from '../citations/citation-guard.js';
import type { StrippedMarker } from '../citations/citation-guard.js';
import { AnswerGenerator } from './answer-generator.js';

/** One step of a guarded answer: safe text as it is written, then what the whole answer cited. */
export type GuardedAnswerEvent =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'end';
      /** The guarded answer in full: exactly the text pieces, joined. */
      readonly text: string;
      readonly citations: ChatCitationsEvent;
      readonly stripped: readonly StrippedMarker[];
      /** The model's own reply, for its token counts. Its text is unguarded and must not be sent. */
      readonly completion: LlmCompletion;
    };

/**
 * The answer as the client may see it: the model's stream passed through a
 * citation guard built from this turn's retrieval, so no id the turn did not
 * retrieve reaches a token or the citations. Each removed marker is logged as
 * a hallucination. This, not `AnswerGenerator`, is what the chat sends.
 */
@Injectable()
export class GuardedAnswer {
  public constructor(
    private readonly generator: AnswerGenerator,
    private readonly logger: AppLogger,
  ) {}

  /** Streams the guarded answer to `question` over `retrieval`. */
  public async *stream(
    question: string,
    retrieval: HybridRetrieval,
  ): AsyncGenerator<GuardedAnswerEvent> {
    const guard = new CitationGuard(allowedCitations(retrieval));
    let text = '';
    for await (const event of this.generator.stream(question, retrieval)) {
      const safe = event.kind === 'text' ? guard.push(event.text) : guard.flush();
      if (safe !== '') {
        text += safe;
        yield { kind: 'text', text: safe };
      }
      if (event.kind === 'end') {
        for (const marker of guard.stripped) {
          // The marker and why, never the answer: the request id joins it to the question.
          this.logger.warn('hallucination', marker, GuardedAnswer.name);
        }
        yield {
          kind: 'end',
          text,
          citations: citationsOf(guard, retrieval),
          stripped: guard.stripped,
          completion: event.completion,
        };
      }
    }
  }
}

function citationsOf(guard: CitationGuard, retrieval: HybridRetrieval): ChatCitationsEvent {
  const aggregate = retrieval.sql?.aggregate;
  if (guard.citedSql && retrieval.sql && aggregate) {
    return chatCitationsEventSchema.parse({
      type: 'citations',
      kind: 'aggregate',
      sql: retrieval.sql.query,
      listingCount: aggregate.listingCount,
    });
  }
  return chatCitationsEventSchema.parse({
    type: 'citations',
    kind: 'properties',
    ids: guard.citedIds,
  });
}
