import type { ChatEvent } from '@api/contracts';

import type { ChatStreamItem } from '../../resources/chat/chat.resource';
import { AGGREGATE_STREAM, NO_MATCH_STREAM, PROPERTIES_STREAM } from '../chat-stream.fixture';
import type { ChatTurn } from './chat-turn';
import { applyChatItem, citedIds, isStreaming, retrievedProperties, startTurn } from './chat-turn';

const QUESTION = 'flats in Aberdeen with a garden under £250,000';

function play(items: readonly ChatStreamItem[], turn = startTurn(1, QUESTION)): ChatTurn {
  return items.reduce(applyChatItem, turn);
}

function eventOf<T extends ChatEvent['type']>(
  stream: readonly ChatEvent[],
  type: T,
): Extract<ChatEvent, { type: T }> {
  return stream.find((event): event is Extract<ChatEvent, { type: T }> => event.type === type)!;
}

describe('chat turn', () => {
  it('starts routing, with nothing heard yet', () => {
    const turn = startTurn(1, QUESTION);

    expect(turn).toMatchObject({ question: QUESTION, stage: 'routing', answer: '' });
    expect(isStreaming(turn)).toBe(true);
  });

  it('moves through each stage as the events that start it arrive', () => {
    const [route, retrieval, token] = PROPERTIES_STREAM;

    const stages = [route, retrieval, token].map(
      (_, index) => play(PROPERTIES_STREAM.slice(0, index + 1)).stage,
    );

    expect(stages).toEqual(['retrieving', 'answering', 'answering']);
  });

  it.each([
    ['properties', PROPERTIES_STREAM],
    ['aggregate', AGGREGATE_STREAM],
    ['no match', NO_MATCH_STREAM],
  ])('keeps everything a %s stream sent, and ends done', (_, stream) => {
    const turn = play(stream);

    expect(turn.stage).toBe('done');
    expect(isStreaming(turn)).toBe(false);
    expect(turn.route).toEqual(eventOf(stream, 'route'));
    expect(turn.retrieval).toEqual(eventOf(stream, 'retrieval'));
    expect(turn.citations).toEqual(eventOf(stream, 'citations'));
    expect(turn.answer).toBe(
      stream.map((event) => (event.type === 'token' ? event.text : '')).join(''),
    );
    expect(turn.error).toBeNull();
  });

  it('goes straight to answering for an out of scope question, which retrieves nothing', () => {
    const turn = play([{ ...eventOf(PROPERTIES_STREAM, 'route'), intent: 'out_of_scope' }]);

    expect(turn.stage).toBe('answering');
  });

  it('keeps the text so far and a safe message when the API ends with an error', () => {
    const turn = play([
      ...PROPERTIES_STREAM.slice(0, 3),
      { type: 'error', message: 'Something went wrong while answering. Please try again.' },
    ]);

    expect(turn.stage).toBe('failed');
    expect(turn.error).toBe('Something went wrong while answering. Please try again.');
    expect(turn.answer).not.toBe('');
    expect(turn.citations).toBeNull();
  });

  it('fails with the client message when the stream could not be read', () => {
    const turn = play([
      { type: 'failure', failure: { reason: 'network', message: 'The connection was lost.' } },
    ]);

    expect(turn).toMatchObject({ stage: 'failed', error: 'The connection was lost.' });
  });

  it('takes nothing more once it has ended', () => {
    const cancelled: ChatTurn = { ...startTurn(1, QUESTION), stage: 'cancelled' };

    expect(play(PROPERTIES_STREAM, cancelled)).toBe(cancelled);
  });

  it('cites only what the final citations name, and nothing before them', () => {
    const beforeCitations = play(PROPERTIES_STREAM.slice(0, -2));

    expect(beforeCitations.answer).toContain('[P-523]');
    expect(citedIds(beforeCitations)).toEqual([]);
    expect(citedIds(play(PROPERTIES_STREAM))).toEqual(['523', '663']);
    expect(citedIds(play(AGGREGATE_STREAM))).toEqual([]);
  });

  it('lists the retrieved properties, cited or not', () => {
    const retrieval = eventOf(PROPERTIES_STREAM, 'retrieval');
    if (retrieval.kind !== 'properties') {
      throw new Error('expected properties');
    }

    expect(retrievedProperties(play(PROPERTIES_STREAM))).toEqual(retrieval.properties);
    expect(retrievedProperties(play(NO_MATCH_STREAM))).toEqual([]);
  });
});
