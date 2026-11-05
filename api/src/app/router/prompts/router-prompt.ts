import { fillPromptTemplate } from '../../llm/prompts/prompt-template.js';
import type { FilterValues } from '../vocabulary/filter-vocabulary.js';

/**
 * Fills the router prompt with the towns and postcode districts the data
 * holds, so the model names a place only as the filter check will accept it.
 */
export function renderRouterPrompt(template: string, values: FilterValues): string {
  return fillPromptTemplate('Router', template, {
    towns: () => values.towns.join(', '),
    postcodeDistricts: () => values.postcodeDistricts.join(', '),
  });
}
