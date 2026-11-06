import type { LlmCompletion } from '../../../core/llm-provider.js';
import type { LlmCall, LlmService } from '../../llm/llm.service.js';
import { LLM_JOB } from '../../llm/llm-job.js';
import { PromptLoader } from '../../llm/prompts/prompt-loader.js';
import { SqlGenerator } from './sql-generator.js';
import { SqlValidator } from '../validation/sql-validator.js';

// Not one of the prompt's worked examples, so finding it in the instructions would be a leak.
const QUESTION = 'two bed homes in Westhill under 180k';
const SQL =
  "SELECT p.id, p.price FROM properties p WHERE p.postcode_district = 'AB15' AND p.bedrooms = 3 AND p.price < 300000";
const VALIDATED =
  "SELECT `p`.`id`, `p`.`price` FROM `properties` AS `p` WHERE `p`.`postcode_district` = 'AB15' AND `p`.`bedrooms` = 3 AND `p`.`price` < 300000 LIMIT 50";

function generatorReplying(text: string): {
  generator: SqlGenerator;
  complete: ReturnType<typeof vi.fn<(call: LlmCall) => Promise<LlmCompletion>>>;
} {
  const complete = vi.fn<(call: LlmCall) => Promise<LlmCompletion>>(() =>
    Promise.resolve({
      text,
      model: 'answer-model',
      inputTokens: 1,
      outputTokens: 1,
      stopReason: 'STOP',
    }),
  );
  const llm = { complete } as unknown as LlmService;
  return {
    generator: new SqlGenerator(llm, new PromptLoader(), new SqlValidator(50)),
    complete,
  };
}

describe('SqlGenerator', () => {
  it('sends the question as data with the versioned SQL prompt to the answer model', async () => {
    const { generator, complete } = generatorReplying(SQL);

    await generator.generate(QUESTION);

    const call = complete.mock.calls[0][0];
    expect(call.job).toBe(LLM_JOB.ANSWER);
    expect(call.data).toEqual({ question: QUESTION });
    expect(call.prompt).toMatchObject({ name: 'sql', version: 4 });
    expect(call.prompt.text).toContain('Table properties AS p');
    expect(call.prompt.text).not.toContain(QUESTION);
  });

  it.each([
    ['clean SQL', SQL],
    ['fenced SQL', '```sql\n' + SQL + '\n```'],
    ['prose wrapped around fenced SQL', 'Here you go:\n```sql\n' + SQL + '\n```\nHope that helps.'],
    ['a line of prose before the SQL', 'Here is the query:\n' + SQL],
  ])('returns the validated rewrite for %s', async (_, reply) => {
    await expect(generatorReplying(reply).generator.generate(QUESTION)).resolves.toEqual({
      status: 'valid',
      sql: VALIDATED,
      shape: { kind: 'rows', ordered: false },
    });
  });

  it('rejects an invented column and keeps what the model wrote for a retry', async () => {
    const invented = "SELECT p.id FROM properties p WHERE p.epc_rating = 'B'";

    await expect(generatorReplying(invented).generator.generate(QUESTION)).resolves.toEqual({
      status: 'rejected',
      reason: 'column_not_allowed',
      detail: 'column p.epc_rating is not on the allow list',
      candidate: invented,
    });
  });

  it('rejects an empty response', async () => {
    await expect(generatorReplying('').generator.generate(QUESTION)).resolves.toMatchObject({
      status: 'rejected',
      reason: 'parse_error',
    });
  });

  it('rejects prose with no SQL in it', async () => {
    await expect(
      generatorReplying('I am not sure which table holds that.').generator.generate(QUESTION),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'parse_error' });
  });

  it('rejects a stacked statement rather than running the first half', async () => {
    await expect(
      generatorReplying(`${SQL}; DROP TABLE properties`).generator.generate(QUESTION),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'multiple_statements' });
  });

  it.each(['CANNOT_ANSWER', 'CANNOT_ANSWER.', '```\nCANNOT_ANSWER\n```'])(
    'reports %j as a decline, with no SQL',
    async (reply) => {
      await expect(generatorReplying(reply).generator.generate(QUESTION)).resolves.toEqual({
        status: 'declined',
      });
    },
  );

  it('does not treat a query that mentions the decline word as a decline', async () => {
    const sql = "SELECT p.id FROM properties p WHERE p.full_address = 'CANNOT_ANSWER'";
    await expect(generatorReplying(sql).generator.generate(QUESTION)).resolves.toMatchObject({
      status: 'valid',
    });
  });

  it('shows the model the failed query and the database error when asked to correct', async () => {
    const { generator, complete } = generatorReplying(SQL);
    const failed = {
      sql: 'SELECT `p`.`town`, `p`.`price` FROM `properties` AS `p` GROUP BY `p`.`town` LIMIT 50',
      error: 'Expression #2 of SELECT list is not in GROUP BY clause',
    };

    await generator.generate(QUESTION, failed);

    expect(complete.mock.calls[0][0].data).toEqual({
      question: QUESTION,
      failed_query: failed.sql,
      database_error: failed.error,
    });
  });

  it('lets a model failure reach the caller', async () => {
    const complete = vi.fn(() =>
      Promise.reject(new Error('Model answer-model did not answer in time')),
    );
    const generator = new SqlGenerator(
      { complete } as unknown as LlmService,
      new PromptLoader(),
      new SqlValidator(50),
    );

    await expect(generator.generate(QUESTION)).rejects.toThrow('did not answer in time');
  });
});
