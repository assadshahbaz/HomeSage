import { TextsPerMinutePace } from './texts-per-minute-pace.js';

const LIMIT = 100;

// A clock that only moves when the pace waits, so no test waits for real.
function clock(): {
  pace: TextsPerMinutePace;
  waits: number[];
  now: () => number;
  advance: (ms: number) => void;
} {
  let time = 1_000_000;
  const waits: number[] = [];
  const pace = new TextsPerMinutePace(
    LIMIT,
    () => time,
    (ms) => {
      waits.push(ms);
      time += ms;
      return Promise.resolve();
    },
  );
  return {
    pace,
    waits,
    now: () => time,
    advance: (ms) => {
      time += ms;
    },
  };
}

describe('TextsPerMinutePace', () => {
  it('sends at once while the texts in the last minute fit under the limit', async () => {
    const { pace, waits } = clock();

    await pace.reserve(40);
    await pace.reserve(60);

    expect(waits).toEqual([]);
  });

  it('waits until the oldest batch leaves the minute when the next one would go over', async () => {
    const { pace, waits, advance } = clock();

    await pace.reserve(100);
    advance(15_000);
    await pace.reserve(100);

    expect(waits).toEqual([45_000]);
  });

  it('frees only as much as has left the window', async () => {
    const { pace, waits, advance } = clock();

    await pace.reserve(50);
    advance(10_000);
    await pace.reserve(50);
    advance(10_000);
    // The first 50 leave 40 seconds from now, and that is enough for 30 more.
    await pace.reserve(30);

    expect(waits).toEqual([40_000]);
  });

  it('keeps a full run at the limit: 250 texts in batches of 100 take two waits', async () => {
    const { pace, waits } = clock();

    for (const batch of [100, 100, 50]) {
      await pace.reserve(batch);
    }

    expect(waits).toEqual([60_000, 60_000]);
  });

  it('refuses a batch larger than the limit, since it could never be sent', async () => {
    const { pace } = clock();

    await expect(pace.reserve(101)).rejects.toThrow(
      'A batch of 101 texts can never fit a limit of 100 a minute',
    );
  });
});
