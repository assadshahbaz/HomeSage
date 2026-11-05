import type { ChatEvent } from '@api/contracts';
import { chatEventSchema } from '@api/contracts';

import {
  AGGREGATE_STREAM,
  NO_MATCH_STREAM,
  PROPERTIES_STREAM,
  STRIPPED_ID_STREAM,
} from './chat-stream.fixture';

const answerText = (stream: readonly ChatEvent[]): string =>
  stream.map((event) => (event.type === 'token' ? event.text : '')).join('');

const citationsOf = (stream: readonly ChatEvent[]): ChatEvent =>
  stream.find((event) => event.type === 'citations')!;

describe.each([
  ['the properties stream', PROPERTIES_STREAM],
  ['the aggregate stream', AGGREGATE_STREAM],
  ['the no match stream', NO_MATCH_STREAM],
  ['the stripped id stream', STRIPPED_ID_STREAM],
])('%s', (_label, stream) => {
  it('parses event by event with the API contract, unchanged', () => {
    for (const event of stream) {
      expect(chatEventSchema.parse(event)).toEqual(event);
    }
  });

  it('opens with route and closes with citations then done', () => {
    expect(stream[0]?.type).toBe('route');
    expect(stream.slice(-2).map((event) => event.type)).toEqual(['citations', 'done']);
  });
});

describe('the properties stream', () => {
  it('cites exactly the markers in its text, in order, including one split across tokens', () => {
    const markers = [...answerText(PROPERTIES_STREAM).matchAll(/\[P-(\d+)\]/g)].map(
      (match) => match[1],
    );

    expect(citationsOf(PROPERTIES_STREAM)).toMatchObject({ kind: 'properties', ids: markers });
  });

  it('retrieves a property it does not cite', () => {
    const retrieval = PROPERTIES_STREAM.find((event) => event.type === 'retrieval');
    const retrievedIds =
      retrieval?.kind === 'properties' ? retrieval.properties.map((property) => property.id) : [];

    expect(retrievedIds).toContain('6');
    expect(citationsOf(PROPERTIES_STREAM)).toMatchObject({ ids: ['523', '663'] });
  });
});

describe('the aggregate stream', () => {
  it('cites its query with [SQL] and no property marker', () => {
    const text = answerText(AGGREGATE_STREAM);

    expect(text).toContain('[SQL]');
    expect(text).not.toMatch(/\[P-/);
    expect(citationsOf(AGGREGATE_STREAM)).toMatchObject({ kind: 'aggregate', listingCount: 53 });
  });
});

describe('the no match stream', () => {
  it('says why nothing came back and cites nothing', () => {
    expect(NO_MATCH_STREAM).toContainEqual({ type: 'retrieval', kind: 'none', reason: 'no_match' });
    expect(answerText(NO_MATCH_STREAM)).not.toMatch(/\[P-/);
    expect(citationsOf(NO_MATCH_STREAM)).toEqual({
      type: 'citations',
      kind: 'properties',
      ids: [],
    });
  });
});

describe('the stripped id stream', () => {
  it('streams a marker its final citations leave out', () => {
    expect(answerText(STRIPPED_ID_STREAM)).toContain('[P-999999]');
    expect(citationsOf(STRIPPED_ID_STREAM)).toMatchObject({ ids: ['523', '663'] });
  });
});
