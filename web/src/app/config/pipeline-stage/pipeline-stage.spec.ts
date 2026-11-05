import type { ChatRetrievalEvent } from '@api/contracts';

import { aPropertySummary } from '../../property/property-summary.fixture';
import { PIPELINE_STAGE_LABELS, stageLabel } from './pipeline-stage';

const PROPERTIES = (count: number): ChatRetrievalEvent => ({
  type: 'retrieval',
  kind: 'properties',
  properties: Array.from({ length: count }, (_, index) =>
    aPropertySummary({ id: String(index + 1) }),
  ),
  ranking: 'fused',
});

describe('stageLabel', () => {
  it.each(['routing', 'retrieving', 'answering'] as const)(
    'labels the %s stage from the config',
    (stage) => {
      expect(stageLabel(stage, null)).toBe(PIPELINE_STAGE_LABELS[stage]);
    },
  );

  it.each(['done', 'failed', 'cancelled'] as const)('shows nothing once a turn is %s', (stage) => {
    expect(stageLabel(stage, PROPERTIES(3))).toBeNull();
  });

  it.each([
    [PROPERTIES(1), '1 property'],
    [PROPERTIES(8), '8 properties'],
    [
      {
        type: 'retrieval',
        kind: 'aggregate',
        sql: 'SELECT COUNT(*) FROM properties',
        values: [{ listings: 53 }],
        listingCount: 53,
      },
      '53 listings',
    ],
  ] satisfies [ChatRetrievalEvent, string][])(
    'counts what retrieval sent while answering',
    (retrieval, count) => {
      expect(stageLabel('answering', retrieval)).toBe(
        `${PIPELINE_STAGE_LABELS.answering ?? ''} from ${count}`,
      );
    },
  );

  it('adds no count when nothing was found', () => {
    expect(stageLabel('answering', { type: 'retrieval', kind: 'none', reason: 'no_match' })).toBe(
      PIPELINE_STAGE_LABELS.answering,
    );
  });
});
