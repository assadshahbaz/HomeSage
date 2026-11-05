import { INGESTION_MODE } from './ingestion-mode.js';
import { formatIngestionSummary } from './ingestion-report.js';
import type { IngestionSummary } from './ingestion.service.js';

const NEXT_SINCE = new Date('2026-09-27T11:23:42.000Z');

function summary(overrides: Partial<IngestionSummary> = {}): IngestionSummary {
  return {
    mode: INGESTION_MODE.FULL,
    since: null,
    resumedAfterId: null,
    nextSince: NEXT_SINCE,
    read: 792,
    written: 792,
    failed: 0,
    indexed: 792,
    durationMs: 768_100,
    embedding: { calls: 44, inputTokens: 429_119, costUsd: 0 },
    deadLetters: [],
    ...overrides,
  };
}

describe('formatIngestionSummary', () => {
  it('prints a full run from the beginning, ending with the bound to pass next time', () => {
    const text = formatIngestionSummary(summary());

    expect(text).toContain('  started           from the beginning');
    expect(text).toContain('  documents written 792');
    expect(text).toContain('  duration          768.1 s');
    expect(text).toContain('  embedding cost    $0.000000 at list price');
    expect(text.split('\n').at(-1)).toBe('  next --since      2026-09-27T11:23:42.000Z');
  });

  it('says where a resumed full run continued', () => {
    expect(formatIngestionSummary(summary({ resumedAfterId: 1203 }))).toContain(
      '  started           after property 1203, resuming a stopped run',
    );
  });

  it('says which bound an incremental run read from', () => {
    const text = formatIngestionSummary(
      summary({ mode: INGESTION_MODE.SINCE, since: new Date('2026-09-27T10:00:00.000Z') }),
    );

    expect(text).toContain(
      '  started           with properties changed at or after 2026-09-27T10:00:00.000Z',
    );
  });

  it('says how to get a bound when a resumed run has none', () => {
    expect(formatIngestionSummary(summary({ resumedAfterId: 1203, nextSince: null }))).toContain(
      '  next --since      unknown, as the resumed run recorded none; a run with --full --restart gives one',
    );
  });

  it('lists the first dead letters and counts the rest', () => {
    const deadLetters = Array.from({ length: 12 }, (_, position) => ({
      id: String(1200 + position),
      stage: 'embed' as const,
      reason: 'fetch failed',
    }));

    const text = formatIngestionSummary(summary({ failed: 12, deadLetters }));

    expect(text).toContain('Dead letters (12):');
    expect(text).toContain('  property 1200 at embed: fetch failed');
    expect(text).not.toContain('property 1210');
    expect(text).toContain('  and 2 more, kept in Redis');
  });
});
