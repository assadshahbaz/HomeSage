import { fillPromptTemplate } from '../../llm/prompts/prompt-template.js';
import { describeSchema } from './schema-description.js';
import { allowedFunctions } from '../validation/sql-validator.js';

/**
 * Fills the SQL prompt template from the allow list and the validator, so the
 * columns and functions the model is told about are exactly the ones the
 * validator accepts.
 */
export function renderSqlPrompt(template: string): string {
  return fillPromptTemplate('SQL', template, {
    schema: describeSchema,
    functions: () => allowedFunctions().join(', '),
  });
}
