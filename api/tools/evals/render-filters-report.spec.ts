import { renderFiltersReport } from './render-filters-report.ts';
import type { FilterResult, FiltersEvalRun } from './render-filters-report.ts';

const CLEAN: FilterResult = {
  question: 'a quiet 3 bed family home in Inverurie under £250k',
  source: 'cases: hybrid',
  intent: 'hybrid',
  fallback: null,
  failures: [],
  filters: ['maxPrice', 'towns'],
  returned: 8,
  caught: [],
  leaked: [],
};

const CAUGHT: FilterResult = {
  ...CLEAN,
  question: 'Listings in AB10 with a garden priced between £100,000 and £150,000',
  caught: ['3021 sql: propertyKinds', '4100 sql: maxPrice'],
};

function run(results: readonly FilterResult[]): FiltersEvalRun {
  return {
    finishedAt: new Date('2026-10-10T09:00:00Z'),
    durationMs: 90_000,
    provider: 'some-provider',
    routerModel: 'router-model',
    sqlModel: 'sql-model',
    results,
    narrative: null,
  };
}

describe('renderFiltersReport', () => {
  it('counts the properties caught and the ones that leaked', () => {
    const report = renderFiltersReport(run([CLEAN, CAUGHT]));

    expect(report).toContain('| Returned properties that fail a filter | 0 |');
    expect(report).toContain(
      '| Properties caught outside the filters and dropped | 2, in 1 questions |',
    );
  });

  it('marks a leaked property in bold', () => {
    const report = renderFiltersReport(run([{ ...CLEAN, leaked: ['1207: maxPrice'] }]));

    expect(report).toContain('| Returned properties that fail a filter | 1 |');
    expect(report).toContain('| **1207: maxPrice** |');
  });

  it('lists what each question caught', () => {
    expect(renderFiltersReport(run([CAUGHT]))).toContain(
      '| 3021 sql: propertyKinds; 4100 sql: maxPrice | none |',
    );
  });

  it('counts router fallbacks, which test no filter', () => {
    const report = renderFiltersReport(run([CLEAN, { ...CLEAN, fallback: 'provider_error' }]));

    expect(report).toContain('| Router fallbacks, which test no filter | 1 |');
    expect(report).toContain('| hybrid | provider_error |');
  });
});
