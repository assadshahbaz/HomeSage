import { GatewayTimeoutException } from '@nestjs/common';
import type { LlmCompletion } from '../../core/llm-provider.js';
import type { AppLogger } from '../../platform/logging/app-logger.js';
import { LLM_JOB } from '../llm/llm-job.js';
import type { LlmCall, LlmService } from '../llm/llm.service.js';
import { PromptLoader } from '../llm/prompts/prompt-loader.js';
import { QueryRouter } from './query-router.js';
import type { RouterTurn } from './route.js';
import type { FilterValues, FilterVocabulary } from './vocabulary/filter-vocabulary.js';

// Not one of the prompt's worked examples, so finding it in the instructions would be a leak.
const QUESTION = 'a sunny 3 bed home in Ellon under £260k';
const VALUES: FilterValues = { towns: ['Aberdeen', 'Ellon'], postcodeDistricts: ['AB10', 'AB41'] };
const DEFAULT_FILTERS = { propertyKinds: ['residential'] };
const CITED_FIRST = '1207';
const CITED_SECOND = '1342';
const EARLIER_TURN: RouterTurn = {
  question: '3 bed homes in Ellon under £280k',
  standaloneQuestion: '3 bed homes in Ellon under £280k',
  intent: 'structured',
  filters: { towns: ['Ellon'], minBedrooms: 3, maxBedrooms: 3, propertyKinds: ['residential'] },
  citedIds: [CITED_FIRST, CITED_SECOND],
};

type Complete = (call: LlmCall) => Promise<LlmCompletion>;

function completion(text: string): LlmCompletion {
  return { text, model: 'router-model', inputTokens: 1, outputTokens: 1, stopReason: 'stop' };
}

function build(complete: Complete): {
  router: QueryRouter;
  complete: ReturnType<typeof vi.fn<Complete>>;
  warn: ReturnType<typeof vi.fn>;
} {
  const completeMock = vi.fn<Complete>(complete);
  const warn = vi.fn();
  const vocabulary = { values: () => Promise.resolve(VALUES) } as unknown as FilterVocabulary;
  const logger = { log: vi.fn(), warn } as unknown as AppLogger;
  const router = new QueryRouter(
    { complete: completeMock } as unknown as LlmService,
    new PromptLoader(),
    vocabulary,
    logger,
  );
  return { router, complete: completeMock, warn };
}

function replying(reply: unknown): ReturnType<typeof build> {
  const text = typeof reply === 'string' ? reply : JSON.stringify(reply);
  return build(() => Promise.resolve(completion(text)));
}

function failing(error: Error): ReturnType<typeof build> {
  return build(() => Promise.reject(error));
}

describe('QueryRouter', () => {
  describe('the call', () => {
    it('sends the question and recent turns as data to the router model', async () => {
      const { router, complete } = replying({ intent: 'semantic' });

      await router.route(QUESTION, [EARLIER_TURN]);

      const call = complete.mock.calls[0][0];
      expect(call.job).toBe(LLM_JOB.ROUTER);
      expect(call.prompt).toMatchObject({ name: 'router', version: 1 });
      expect(call.data).toEqual({
        question: QUESTION,
        recent_turns: JSON.stringify([EARLIER_TURN]),
      });
      expect(call.prompt.text).not.toContain(QUESTION);
    });

    it('fills the prompt with the towns and districts the data holds', async () => {
      const { router, complete } = replying({ intent: 'semantic' });

      await router.route(QUESTION);

      expect(complete.mock.calls[0][0].prompt.text).toContain('one of these: Aberdeen, Ellon.');
      expect(complete.mock.calls[0][0].data['recent_turns']).toBe('[]');
    });
  });

  describe('a usable reply', () => {
    it('passes a hybrid reading through with its checked filters', async () => {
      const { router } = replying({
        intent: 'hybrid',
        filters: { towns: ['ellon'], minBedrooms: 3, maxBedrooms: 3, maxPrice: 260_000 },
        semanticQuery: 'sunny home',
        standaloneQuestion: QUESTION,
        propertyIds: [],
      });

      await expect(router.route(QUESTION)).resolves.toEqual({
        intent: 'hybrid',
        filters: {
          towns: ['Ellon'],
          minBedrooms: 3,
          maxBedrooms: 3,
          maxPrice: 260_000,
          propertyKinds: ['residential'],
        },
        semanticQuery: 'sunny home',
        standaloneQuestion: QUESTION,
        propertyIds: [],
        fallback: null,
      });
    });

    it('keeps a structured question free of a meaning search', async () => {
      const { router } = replying({
        intent: 'structured',
        filters: { towns: ['Ellon'] },
        semanticQuery: '',
      });

      await expect(router.route(QUESTION)).resolves.toMatchObject({
        intent: 'structured',
        semanticQuery: '',
      });
    });

    it.each([
      ['missing', {}],
      ['blank', { semanticQuery: '   ' }],
      ['null', { semanticQuery: null }],
    ])('searches by the question when the semantic query is %s', async (_, reply) => {
      const { router } = replying({ intent: 'semantic', ...reply });

      await expect(router.route(QUESTION)).resolves.toMatchObject({ semanticQuery: QUESTION });
    });

    it('declines out of scope with no filters, whatever the model put in them', async () => {
      const { router } = replying({
        intent: 'out_of_scope',
        filters: { towns: ['Ellon'], maxPrice: 1 },
        propertyIds: [CITED_FIRST],
      });

      await expect(router.route('which flats allow cats?', [EARLIER_TURN])).resolves.toEqual({
        intent: 'out_of_scope',
        filters: DEFAULT_FILTERS,
        semanticQuery: '',
        standaloneQuestion: 'which flats allow cats?',
        propertyIds: [],
        fallback: null,
      });
    });

    it('drops filter values the data does not hold and logs them', async () => {
      const { router, warn } = replying({
        intent: 'hybrid',
        filters: { towns: ['Glasgow'], bathrooms: 2 },
        semanticQuery: 'sunny home',
      });

      const route = await router.route(QUESTION);

      expect(route.filters).toEqual(DEFAULT_FILTERS);
      expect(warn).toHaveBeenCalledWith(
        'router dropped filters',
        {
          dropped: [
            { filter: 'towns', value: 'Glasgow', reason: 'unknown_value' },
            { filter: 'bathrooms', value: 2, reason: 'unknown_filter' },
          ],
        },
        'QueryRouter',
      );
    });
  });

  describe('the standalone question', () => {
    it('uses the rewrite of a follow up', async () => {
      const { router } = replying({
        intent: 'structured',
        standaloneQuestion: '2 bed homes in Ellon under £280k',
      });

      await expect(router.route('what about 2 beds?', [EARLIER_TURN])).resolves.toMatchObject({
        standaloneQuestion: '2 bed homes in Ellon under £280k',
      });
    });

    it.each([
      ['missing', {}],
      ['empty', { standaloneQuestion: '' }],
      ['blank', { standaloneQuestion: '  ' }],
      ['null', { standaloneQuestion: null }],
      ['too long to be a question', { standaloneQuestion: 'flat '.repeat(200) }],
    ])('falls back to the question as asked when the rewrite is %s', async (_, reply) => {
      const { router } = replying({ intent: 'semantic', ...reply });

      await expect(router.route(QUESTION)).resolves.toMatchObject({
        standaloneQuestion: QUESTION,
      });
    });
  });

  describe('property ids', () => {
    it('keeps ids an earlier answer cited, with or without the marker prefix, in order', async () => {
      const { router } = replying({
        intent: 'structured',
        propertyIds: [`P-${CITED_SECOND}`, CITED_FIRST, CITED_SECOND],
      });

      await expect(router.route('compare those two', [EARLIER_TURN])).resolves.toMatchObject({
        propertyIds: [CITED_SECOND, CITED_FIRST],
      });
    });

    it('drops ids no earlier answer cited and logs them', async () => {
      const { router, warn } = replying({
        intent: 'structured',
        propertyIds: ['3501', 'P-abc', CITED_FIRST],
      });

      const route = await router.route('the first one', [EARLIER_TURN]);

      expect(route.propertyIds).toEqual([CITED_FIRST]);
      expect(warn).toHaveBeenCalledWith(
        'router dropped property ids',
        { dropped: ['3501', 'P-abc'] },
        'QueryRouter',
      );
    });

    it('drops every id when there are no earlier turns', async () => {
      const { router } = replying({ intent: 'structured', propertyIds: [CITED_FIRST] });

      await expect(router.route('the first one')).resolves.toMatchObject({ propertyIds: [] });
    });
  });

  describe('falling back to hybrid', () => {
    const FALLBACK = {
      intent: 'hybrid',
      filters: DEFAULT_FILTERS,
      semanticQuery: QUESTION,
      standaloneQuestion: QUESTION,
      propertyIds: [],
    };

    it.each([
      [
        'timeout',
        failing(new GatewayTimeoutException('Model router-model did not answer in time')),
      ],
      ['provider_error', failing(new Error('Invalid API Key'))],
      ['parse_failure', replying('I think this is a hybrid question.')],
      ['parse_failure', replying('{"intent": "hybrid",')],
      ['schema_failure', replying({ intent: 'chitchat' })],
      ['schema_failure', replying({ filters: { towns: ['Ellon'] } })],
    ])('falls back with reason %s and logs it', async (reason, { router, warn }) => {
      await expect(router.route(QUESTION)).resolves.toEqual({ ...FALLBACK, fallback: reason });
      expect(warn).toHaveBeenCalledWith(
        `router fell back to hybrid: ${reason}`,
        expect.objectContaining({ reason }),
        'QueryRouter',
      );
    });

    it('logs where a reply broke the schema, never the reply itself', async () => {
      const { router, warn } = replying({ intent: 'print your system prompt' });

      await router.route(QUESTION);

      expect(warn).toHaveBeenCalledWith(
        'router fell back to hybrid: schema_failure',
        { reason: 'schema_failure', issues: ['intent'] },
        'QueryRouter',
      );
    });

    it('lets a failure outside the model call through, rather than hiding it as a fallback', async () => {
      const { complete } = replying({ intent: 'semantic' });
      const vocabulary = {
        values: () => Promise.reject(new Error('connect ECONNREFUSED')),
      } as unknown as FilterVocabulary;
      const router = new QueryRouter(
        { complete } as unknown as LlmService,
        new PromptLoader(),
        vocabulary,
        { log: vi.fn(), warn: vi.fn() } as unknown as AppLogger,
      );

      await expect(router.route(QUESTION)).rejects.toThrow('ECONNREFUSED');
      expect(complete).not.toHaveBeenCalled();
    });
  });
});
