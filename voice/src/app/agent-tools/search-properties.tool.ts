import { Injectable, Logger } from '@nestjs/common';
import { CallMemory } from '../calls/call-memory.js';
import type { HomesageProperty } from '../homesage/chat-events.js';
import { HomesageClient, HomesageUnavailableError } from '../homesage/homesage-client.js';
import { toSpokenText } from '../homesage/spoken-text.js';
import { done } from './agent-tool.js';
import type { AgentTool, CallContext, ToolOutcome } from './agent-tool.js';
import { TOOL_NAME } from './tool-definitions.js';
import type { SearchPropertiesArgs } from './tool-definitions.js';

/** More than this and the model is tempted to read out a list nobody can follow. */
export const MAX_HOMES_IN_RESULT = 5;
/** HomeSage can write a paragraph per home; the model only needs enough to summarise. */
export const MAX_ANSWER_CHARACTERS = 1_500;
const REQUEST_ID_LENGTH = 24;

const price = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

/**
 * Answers a buyer's question from HomeSage's listings. The model gets the
 * answer with its citation markers removed, plus a ref for each home it named,
 * which `get_viewing_slots` and `book_viewing` take. Those homes are
 * remembered for the call, so nothing can be booked that never came up.
 */
@Injectable()
export class SearchPropertiesTool implements AgentTool<SearchPropertiesArgs> {
  public readonly name = TOOL_NAME.SEARCH_PROPERTIES;
  private readonly logger = new Logger(SearchPropertiesTool.name);

  public constructor(
    private readonly homesage: HomesageClient,
    private readonly memory: CallMemory,
  ) {}

  public async run(args: SearchPropertiesArgs, call: CallContext): Promise<ToolOutcome> {
    const sessionId = this.memory.sessionIdFor(call.callId);
    const requestId = `vapi-${call.callId.replace(/[^a-zA-Z0-9]/g, '').slice(0, REQUEST_ID_LENGTH)}`;

    let answer;
    try {
      answer = await this.homesage.ask(args.question, sessionId, requestId);
    } catch (error) {
      if (error instanceof HomesageUnavailableError) {
        this.logger.warn(`search failed (${error.reason}): ${error.message}`);
        return done(
          'The listings search is not available right now. Apologise, say you cannot check the listings at the moment, and offer to take a message so the team can call back with homes that match.',
        );
      }
      throw error;
    }

    this.memory.rememberProperties(call.callId, answer.citedProperties);
    return done(resultText(toSpokenText(answer.text), answer.citedProperties));
  }
}

function resultText(spoken: string, homes: readonly HomesageProperty[]): string {
  const answer =
    spoken.length > MAX_ANSWER_CHARACTERS ? `${spoken.slice(0, MAX_ANSWER_CHARACTERS)}…` : spoken;
  const parts = [`Listings answer: ${answer}`];
  if (homes.length > 0) {
    const listed = homes.slice(0, MAX_HOMES_IN_RESULT).map(describeHome).join('; ');
    parts.push(
      `Homes in this answer, with refs for get_viewing_slots and book_viewing only (never say a ref aloud): ${listed}.`,
      'Tell the caller this in two or three short spoken sentences, mention no more than three homes, and ask if they would like to book a viewing.',
    );
  } else {
    parts.push(
      'Tell the caller this briefly, then ask whether they would like to change the area, budget or size.',
    );
  }
  return parts.join(' ');
}

function describeHome(home: HomesageProperty): string {
  const bedrooms =
    home.bedrooms === null || home.bedrooms === 0
      ? ''
      : `, ${home.bedrooms} bedroom${home.bedrooms === 1 ? '' : 's'}`;
  return `ref ${home.id}: ${home.address}, ${price.format(home.price)}${bedrooms}`;
}
