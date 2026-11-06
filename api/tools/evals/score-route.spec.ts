import type { Route } from '../../src/app/router/route.ts';
import { scoreRoute, tallyFilters } from './score-route.ts';

function route(overrides: Partial<Route> = {}): Route {
  return {
    intent: 'hybrid',
    filters: { towns: ['Ellon'], maxPrice: 250_000, propertyKinds: ['residential'] },
    semanticQuery: 'quiet home',
    standaloneQuestion: 'a quiet home in Ellon under £250k',
    propertyIds: [],
    fallback: null,
    ...overrides,
  };
}

describe('scoreRoute', () => {
  it('counts the intent right when it is any of the acceptable ones', () => {
    expect(scoreRoute({ intents: ['semantic', 'hybrid'] }, route()).intentCorrect).toBe(true);
    expect(scoreRoute({ intents: ['structured'] }, route()).intentCorrect).toBe(false);
  });

  it('scores no filters when none were expected', () => {
    expect(scoreRoute({ intents: ['hybrid'] }, route()).filters).toEqual([]);
  });

  it('matches expected filters and ignores the default property kinds', () => {
    expect(
      scoreRoute({ intents: ['hybrid'], filters: { towns: ['Ellon'], maxPrice: 250_000 } }, route())
        .filters,
    ).toEqual([
      { filter: 'towns', outcome: 'matched' },
      { filter: 'maxPrice', outcome: 'matched' },
    ]);
  });

  it('compares lists whatever their order', () => {
    expect(
      scoreRoute(
        { intents: ['hybrid'], filters: { councilTaxBands: ['A', 'B'] } },
        route({ filters: { councilTaxBands: ['B', 'A'], propertyKinds: ['residential'] } }),
      ).filters,
    ).toEqual([{ filter: 'councilTaxBands', outcome: 'matched' }]);
  });

  it('marks a filter wrong, missed or extra', () => {
    expect(
      scoreRoute(
        { intents: ['hybrid'], filters: { towns: ['Ellon'], minBedrooms: 3 } },
        route({
          filters: { towns: ['Inverurie'], hasGarden: true, propertyKinds: ['residential'] },
        }),
      ).filters,
    ).toEqual([
      { filter: 'towns', outcome: 'wrong' },
      { filter: 'minBedrooms', outcome: 'missed' },
      { filter: 'hasGarden', outcome: 'extra' },
    ]);
  });

  it('counts property kinds when the question asked for other kinds', () => {
    const allKinds = ['residential', 'plot', 'commercial', 'other'];

    expect(
      scoreRoute({ intents: ['structured'], filters: { propertyKinds: allKinds } }, route())
        .filters,
    ).toEqual([
      { filter: 'propertyKinds', outcome: 'wrong' },
      { filter: 'towns', outcome: 'extra' },
      { filter: 'maxPrice', outcome: 'extra' },
    ]);
  });

  it('scores no filters for a rightly declined question', () => {
    expect(
      scoreRoute(
        { intents: ['structured', 'out_of_scope'], filters: { towns: ['Aberdeen'] } },
        route({ intent: 'out_of_scope', filters: { propertyKinds: ['residential'] } }),
      ),
    ).toEqual({ intentCorrect: true, filters: [] });
  });
});

describe('tallyFilters', () => {
  it('adds up outcomes per filter, sorted by name', () => {
    expect(
      tallyFilters([
        {
          intentCorrect: true,
          filters: [
            { filter: 'towns', outcome: 'matched' },
            { filter: 'maxPrice', outcome: 'missed' },
          ],
        },
        {
          intentCorrect: false,
          filters: [
            { filter: 'towns', outcome: 'wrong' },
            { filter: 'towns', outcome: 'matched' },
          ],
        },
      ]),
    ).toEqual([
      { filter: 'maxPrice', matched: 0, wrong: 0, missed: 1, extra: 0 },
      { filter: 'towns', matched: 2, wrong: 1, missed: 0, extra: 0 },
    ]);
  });
});
