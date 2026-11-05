import { parseIngestArguments } from './ingest-arguments.js';
import { INGESTION_MODE } from './ingestion-mode.js';

describe('parseIngestArguments', () => {
  it.each([
    [['--full'], { mode: INGESTION_MODE.FULL, restart: false }],
    [['--full', '--restart'], { mode: INGESTION_MODE.FULL, restart: true }],
    [
      ['--since', '2026-09-27T10:00:00Z'],
      { mode: INGESTION_MODE.SINCE, since: new Date('2026-09-27T10:00:00.000Z') },
    ],
    [
      ['--since=2026-09-27T11:00:00.250+01:00'],
      { mode: INGESTION_MODE.SINCE, since: new Date('2026-09-27T10:00:00.250Z') },
    ],
  ])('reads %j', (args, expected) => {
    expect(parseIngestArguments(args)).toEqual(expected);
  });

  it.each([
    [[], 'Pass exactly one of --full or --since'],
    [['--restart'], 'Pass exactly one of --full or --since'],
    [['--full', '--since', '2026-09-27T10:00:00Z'], 'Pass exactly one of --full or --since'],
    [['--since', '2026-09-27T10:00:00Z', '--restart'], '--restart goes with --full only'],
    [['--since', '2026-09-27T10:00:00'], 'is not an ISO timestamp with a zone'],
    [['--since', '2026-02-30T10:00:00Z'], 'is not an ISO timestamp with a zone'],
    [['--since', 'yesterday'], 'is not an ISO timestamp with a zone'],
  ])('refuses %j, with the usage', (args, problem) => {
    expect(() => parseIngestArguments(args)).toThrow(problem);
    expect(() => parseIngestArguments(args)).toThrow('Usage: npm run ingest');
  });

  it('refuses --since with no value and an unknown flag', () => {
    expect(() => parseIngestArguments(['--since'])).toThrow(
      "Option '--since <value>' argument missing",
    );
    expect(() => parseIngestArguments(['--everything'])).toThrow("Unknown option '--everything'");
  });
});
