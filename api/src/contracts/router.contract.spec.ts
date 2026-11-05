import { routerReplySchema } from './router.contract.js';

describe('routerReplySchema', () => {
  it('reads a full reply', () => {
    const reply = {
      intent: 'hybrid',
      filters: { maxPrice: 250_000, towns: ['Aberdeen'] },
      semanticQuery: 'quiet street with a garden',
      standaloneQuestion: 'quiet homes in Aberdeen under £250k with a garden',
      propertyIds: ['P-3501'],
    };

    expect(routerReplySchema.parse(reply)).toEqual(reply);
  });

  it('reads a reply with only an intent', () => {
    expect(routerReplySchema.parse({ intent: 'out_of_scope' })).toEqual({
      intent: 'out_of_scope',
    });
  });

  it('accepts null for every field but the intent', () => {
    expect(
      routerReplySchema.safeParse({
        intent: 'semantic',
        filters: null,
        semanticQuery: null,
        standaloneQuestion: null,
        propertyIds: null,
      }).success,
    ).toBe(true);
  });

  it('drops keys it does not know', () => {
    expect(routerReplySchema.parse({ intent: 'semantic', confidence: 0.9 })).toEqual({
      intent: 'semantic',
    });
  });

  it.each([
    ['a missing intent', { filters: {} }],
    ['an unknown intent', { intent: 'chitchat' }],
    ['filters that are not an object', { intent: 'structured', filters: ['Aberdeen'] }],
    ['a semantic query that is not text', { intent: 'semantic', semanticQuery: 42 }],
    ['property ids that are not text', { intent: 'semantic', propertyIds: [3501] }],
    ['a reply that is not an object', 'hybrid'],
  ])('rejects %s', (_, reply) => {
    expect(routerReplySchema.safeParse(reply).success).toBe(false);
  });
});
