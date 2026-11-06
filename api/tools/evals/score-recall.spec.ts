import { scoreRecall, scoreRecallOfEither } from './score-recall.ts';

const FLAT = 1129;
const GARDEN_FLAT = 2537;
const BASEMENT_FLAT = 4172;
const HOUSE = 2438;
const CHALMERS_FLATS = 1529;

describe('scoreRecall', () => {
  it('counts the relevant ids in the top k', () => {
    expect(
      scoreRecall([HOUSE, FLAT, CHALMERS_FLATS], [FLAT, GARDEN_FLAT, BASEMENT_FLAT], [], 3),
    ).toEqual({ found: 1, possible: 3, recall: 1 / 3 });
  });

  it('divides by k when there are more relevant ids than slots', () => {
    expect(scoreRecall([FLAT, GARDEN_FLAT], [FLAT, GARDEN_FLAT, BASEMENT_FLAT], [], 2)).toEqual({
      found: 2,
      possible: 2,
      recall: 1,
    });
  });

  it('divides by the relevant ids when there are fewer of them than slots', () => {
    expect(scoreRecall([HOUSE, FLAT, CHALMERS_FLATS], [FLAT], [], 3)).toEqual({
      found: 1,
      possible: 1,
      recall: 1,
    });
  });

  it('drops uncertain ids before the cut, so they cost no slot', () => {
    // Without the drop the top 2 would hold one relevant flat; with it, both.
    expect(
      scoreRecall([CHALMERS_FLATS, FLAT, GARDEN_FLAT], [FLAT, GARDEN_FLAT], [CHALMERS_FLATS], 2),
    ).toEqual({ found: 2, possible: 2, recall: 1 });
  });

  it('never counts an uncertain id as found', () => {
    expect(scoreRecall([CHALMERS_FLATS], [FLAT], [CHALMERS_FLATS], 1)).toEqual({
      found: 0,
      possible: 1,
      recall: 0,
    });
  });

  it('counts a repeated id once', () => {
    expect(scoreRecall([FLAT, FLAT], [FLAT, GARDEN_FLAT], [], 2).found).toBe(1);
  });
});

describe('scoreRecallOfEither', () => {
  it('counts a relevant id found in either top k once', () => {
    expect(
      scoreRecallOfEither(
        [FLAT, HOUSE],
        [GARDEN_FLAT, FLAT],
        [FLAT, GARDEN_FLAT, BASEMENT_FLAT],
        [],
        2,
      ),
    ).toEqual({ found: 2, possible: 2, recall: 1 });
  });

  it('looks only at the top k of each ranking', () => {
    expect(
      scoreRecallOfEither(
        [HOUSE, CHALMERS_FLATS, FLAT],
        [HOUSE, GARDEN_FLAT],
        [FLAT, GARDEN_FLAT],
        [],
        1,
      ),
    ).toEqual({ found: 0, possible: 1, recall: 0 });
  });

  it('never finds more than one ranking could hold', () => {
    expect(
      scoreRecallOfEither(
        [FLAT, GARDEN_FLAT],
        [BASEMENT_FLAT, CHALMERS_FLATS],
        [FLAT, GARDEN_FLAT, BASEMENT_FLAT, CHALMERS_FLATS],
        [],
        2,
      ),
    ).toEqual({ found: 2, possible: 2, recall: 1 });
  });

  it('skips uncertain ids before the cut in both rankings', () => {
    expect(
      scoreRecallOfEither([HOUSE, FLAT], [HOUSE, GARDEN_FLAT], [FLAT, GARDEN_FLAT], [HOUSE], 1),
    ).toEqual({ found: 1, possible: 1, recall: 1 });
  });
});
