import type {
  ChatCitationsEvent,
  ChatRetrievalEvent,
  ChatRouteEvent,
  PropertySummary,
} from '@api/contracts';
import { CHAT_INTENT } from '@api/contracts';

import type { ChatStreamItem } from '../../resources/chat/chat.resource';

/** Where a turn is: the pipeline stage it waits on, or how it ended. */
export const CHAT_STAGE = {
  ROUTING: 'routing',
  RETRIEVING: 'retrieving',
  ANSWERING: 'answering',
  DONE: 'done',
  FAILED: 'failed',
  /** A newer question or a new conversation stopped it. */
  CANCELLED: 'cancelled',
} as const;

export type ChatStage = (typeof CHAT_STAGE)[keyof typeof CHAT_STAGE];

/** One question and everything its stream has sent so far. */
export interface ChatTurn {
  readonly id: number;
  readonly question: string;
  readonly stage: ChatStage;
  /** The answer as guarded tokens, joined. */
  readonly answer: string;
  readonly route: ChatRouteEvent | null;
  readonly retrieval: ChatRetrievalEvent | null;
  /** The final citations, the only source of which ids may become links. */
  readonly citations: ChatCitationsEvent | null;
  /** Safe to show; set when the turn failed. */
  readonly error: string | null;
}

/** A turn that has sent its question and heard nothing back yet. */
export function startTurn(id: number, question: string): ChatTurn {
  return {
    id,
    question,
    stage: CHAT_STAGE.ROUTING,
    answer: '',
    route: null,
    retrieval: null,
    citations: null,
    error: null,
  };
}

/** True while the turn's stream is still open. */
export function isStreaming(turn: ChatTurn): boolean {
  return (
    turn.stage === CHAT_STAGE.ROUTING ||
    turn.stage === CHAT_STAGE.RETRIEVING ||
    turn.stage === CHAT_STAGE.ANSWERING
  );
}

/**
 * The turn after one more stream item. Each event moves the stage on to the
 * work it starts: an out of scope route skips retrieval, which it never gets.
 * A turn that already ended takes no more items.
 */
export function applyChatItem(turn: ChatTurn, item: ChatStreamItem): ChatTurn {
  if (!isStreaming(turn)) {
    return turn;
  }
  switch (item.type) {
    case 'route':
      return {
        ...turn,
        route: item,
        stage:
          item.intent === CHAT_INTENT.OUT_OF_SCOPE ? CHAT_STAGE.ANSWERING : CHAT_STAGE.RETRIEVING,
      };
    case 'retrieval':
      return { ...turn, retrieval: item, stage: CHAT_STAGE.ANSWERING };
    case 'token':
      return { ...turn, answer: turn.answer + item.text, stage: CHAT_STAGE.ANSWERING };
    case 'citations':
      return { ...turn, citations: item };
    case 'done':
      return { ...turn, stage: CHAT_STAGE.DONE };
    case 'error':
      return { ...turn, stage: CHAT_STAGE.FAILED, error: item.message };
    case 'failure':
      return { ...turn, stage: CHAT_STAGE.FAILED, error: item.failure.message };
  }
}

/** The property ids the final citations name, in order; none before they arrive. */
export function citedIds(turn: ChatTurn): readonly string[] {
  return turn.citations?.kind === 'properties' ? turn.citations.ids : [];
}

/** The properties retrieval sent, whether or not the answer cites them. */
export function retrievedProperties(turn: ChatTurn): readonly PropertySummary[] {
  return turn.retrieval?.kind === 'properties' ? turn.retrieval.properties : [];
}
