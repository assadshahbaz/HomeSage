import { z } from 'zod';
import { readJson } from './eval-data.ts';

/**
 * A question waiting to be labelled, with the rule its labels are proposed by:
 * a query naming every property whose record supports the question. The rule
 * is what a reviewer checks, so it is kept beside the question rather than in
 * the golden set, whose entries hold only the labels.
 */
const labellingQuestionSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  category: z.string().min(1),
  question: z.string().min(1),
  rule: z
    .string()
    .regex(/^SELECT p\.id FROM properties p /, 'a rule selects p.id from properties p'),
});

export type LabellingQuestion = z.infer<typeof labellingQuestionSchema>;

/** A milestone's questions to label, such as `workbench/evals/labelling/m2-questions.json`. */
export function loadLabellingQuestions(path: string): LabellingQuestion[] {
  const questions = z.array(labellingQuestionSchema).parse(readJson(path));
  if (new Set(questions.map((question) => question.id)).size !== questions.length) {
    throw new Error(`${path} has a repeated id`);
  }
  return questions;
}
