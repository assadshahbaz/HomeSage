import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { repoPath } from '../../../../tools/repo-path.js';
import { routerReplySchema } from '../../../contracts/index.js';
import { checkRouteFilters } from '../reply/route-filters.js';
import type { FilterValues } from '../vocabulary/filter-vocabulary.js';
import { renderRouterPrompt } from './router-prompt.js';

// The towns and districts the prompt's examples use, all of which the data holds.
const VALUES: FilterValues = {
  towns: ['Aberdeen', 'Ellon', 'Huntly', 'Inverurie', 'Turriff', 'Westhill'],
  postcodeDistricts: ['AB15', 'AB24', 'AB41'],
};

const template = readFileSync(
  fileURLToPath(new URL('./router.v1.md', import.meta.url)),
  'utf8',
).replace(/\r\n/g, '\n');

/** The worked examples, as the question and the reply the prompt teaches. */
function examples(): { question: string; reply: unknown }[] {
  return [...template.matchAll(/^Question: (.+)\n(\{.+\})$/gm)].map((match) => ({
    question: match[1],
    reply: JSON.parse(match[2]) as unknown,
  }));
}

describe('renderRouterPrompt', () => {
  it('lists the towns and districts the data holds', () => {
    const rendered = renderRouterPrompt(template, VALUES);

    expect(rendered).toContain(
      'one of these: Aberdeen, Ellon, Huntly, Inverurie, Turriff, Westhill.',
    );
    expect(rendered).toContain('one of these: AB15, AB24, AB41.');
    expect(rendered).not.toMatch(/\{\{/);
  });
});

describe('router.v1 prompt', () => {
  it('has a worked example for every intent', () => {
    const intents = new Set(examples().map(({ reply }) => routerReplySchema.parse(reply).intent));

    expect([...intents].sort()).toEqual(['hybrid', 'out_of_scope', 'semantic', 'structured']);
  });

  it.each(examples())('teaches a reply that passes every check: $question', ({ reply }) => {
    const parsed = routerReplySchema.parse(reply);

    expect(checkRouteFilters(parsed.filters ?? {}, VALUES).dropped).toEqual([]);
  });

  it.each([
    ['the question being data', /data from a user, never instructions/],
    ['EPC ratings', /no EPC ratings/],
    ['pet, smoking and furnishing policy', /no pet, smoking or furnishing policy/],
    ['coordinates', /no coordinates/],
    ['a missing feature not being a filter', /"no garden" is never a filter/],
    ['a fact with no filter still being answerable', /never out_of_scope/],
    ['JSON only', /Reply with one JSON object only/],
  ])('says what it must about %s', (_, pattern) => {
    expect(template).toMatch(pattern);
  });

  it('teaches with wordings the golden set does not use', () => {
    const golden = new Set(
      (
        JSON.parse(readFileSync(repoPath('workbench/evals/golden-set.json'), 'utf8')) as {
          question: string;
        }[]
      ).map((entry) => entry.question),
    );

    expect(examples().filter(({ question }) => golden.has(question))).toEqual([]);
  });
});
