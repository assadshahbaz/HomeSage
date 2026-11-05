import type { ChatRetrievalEvent } from '@api/contracts';

import type { ChatStage } from '../../chat/turn/chat-turn';
import { CHAT_STAGE } from '../../chat/turn/chat-turn';
import { formatCount } from '../../format/count';

/**
 * What the pipeline is doing in each stage a turn waits on. Each stage starts
 * with an event: sending the question, then `route`, then `retrieval`.
 */
export const PIPELINE_STAGE_LABELS: Readonly<Partial<Record<ChatStage, string>>> = {
  [CHAT_STAGE.ROUTING]: 'Understanding the question',
  [CHAT_STAGE.RETRIEVING]: 'Searching properties',
  [CHAT_STAGE.ANSWERING]: 'Writing the answer',
};

/**
 * The line shown while a turn streams, with what retrieval found once it is
 * known, or null once the turn has ended. Counts come from the `retrieval` event.
 */
export function stageLabel(stage: ChatStage, retrieval: ChatRetrievalEvent | null): string | null {
  const label = PIPELINE_STAGE_LABELS[stage];
  if (label === undefined || stage !== CHAT_STAGE.ANSWERING || retrieval === null) {
    return label ?? null;
  }
  switch (retrieval.kind) {
    case 'properties':
      return `${label} from ${formatCount(retrieval.properties.length, { one: 'property', many: 'properties' }) ?? ''}`;
    case 'aggregate':
      return `${label} from ${formatCount(retrieval.listingCount, { one: 'listing', many: 'listings' }) ?? ''}`;
    case 'none':
      return label;
  }
}
