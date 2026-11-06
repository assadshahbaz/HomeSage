import { SqlValidator } from '../../src/app/sql/validation/sql-validator.ts';
import {
  loadInjectionCases,
  loadQuestionInjections,
  loadRouterCases,
  reportPath,
} from './eval-data.ts';

const ROW_LIMIT = 50;

describe('the injection cases', () => {
  it.each(loadInjectionCases())('are all refused by the validator: $name', ({ sql }) => {
    expect(new SqlValidator(ROW_LIMIT).validate(sql)).toMatchObject({ ok: false });
  });
});

describe('the question level injection cases', () => {
  const cases = loadQuestionInjections();

  it.each([
    ['an instruction override', /ignore previous instructions/i],
    ['information_schema', /information_schema/],
    ['another schema', /performance_schema|mysql\./],
    ['a write after a read', /delete/i],
    ['a stacked statement', /;/],
    ['an SQL comment', /--|\/\*/],
    ['a request for the prompt', /system prompt/i],
    ['a request for listing dates', /listed in the last/i],
  ])('include %s', (_, pattern) => {
    expect(cases.some((injection) => pattern.test(injection.question))).toBe(true);
  });
});

describe('the router cases', () => {
  const cases = loadRouterCases();

  it.each(['hybrid', 'out_of_scope'] as const)('include at least six expecting %s', (intent) => {
    expect(
      cases.filter((routerCase) => routerCase.route.intents.includes(intent)).length,
    ).toBeGreaterThanOrEqual(6);
  });

  it('include places and bands the data does not hold', () => {
    expect(cases.filter((routerCase) => routerCase.category === 'unknown value').length).toBe(4);
  });

  it('expect hybrid cases to come back with their filters', () => {
    const hybrid = cases.filter((routerCase) => routerCase.category === 'hybrid');
    expect(hybrid.filter((routerCase) => routerCase.route.filters === undefined)).toEqual([]);
  });
});

describe('reportPath', () => {
  it('points into workbench/evals/reports at the repo root', () => {
    expect(reportPath('m1.md').replaceAll('\\', '/')).toMatch(
      /\/workbench\/evals\/reports\/m1\.md$/,
    );
  });
});
