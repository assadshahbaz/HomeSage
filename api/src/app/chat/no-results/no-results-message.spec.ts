import { searchFiltersSchema } from '../../../contracts/index.js';
import { noMatchMessage, SEARCH_FAILED_MESSAGE } from './no-results-message.js';

describe('noMatchMessage', () => {
  it('names every filter so one can be loosened', () => {
    expect(
      noMatchMessage(searchFiltersSchema.parse({ towns: ['Westhill'], maxPrice: 50_000 })),
    ).toBe(
      'No listings in this data match everything you asked for: in Westhill, up to £50,000. Loosening one of these may find some.',
    );
  });

  it('says plainly that nothing matched when no filter was set', () => {
    expect(noMatchMessage(searchFiltersSchema.parse({}))).toBe(
      'No listings in this data match your question.',
    );
  });

  it('carries no citation marker', () => {
    expect(noMatchMessage(searchFiltersSchema.parse({ towns: ['Ellon'] }))).not.toContain('[');
  });
});

describe('SEARCH_FAILED_MESSAGE', () => {
  it('does not claim that nothing matched', () => {
    expect(SEARCH_FAILED_MESSAGE).not.toMatch(/no listings/i);
  });
});
