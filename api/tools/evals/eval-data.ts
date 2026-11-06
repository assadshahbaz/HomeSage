import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { repoPath } from '../repo-path.ts';
import { routeExpectationSchema } from './route-expectation.ts';

const injectionCaseSchema = z.object({ name: z.string(), sql: z.string() });

/** A hostile question, sent through `POST /sql` like any user's. */
const questionInjectionSchema = z.object({
  id: z.string(),
  category: z.string(),
  question: z.string(),
});

/**
 * A question only the router is scored on, for kinds the golden set does not
 * hold yet: hybrid, out of scope and values the data does not have.
 */
const routerCaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  category: z.string().min(1),
  question: z.string().min(1),
  route: routeExpectationSchema,
});

export type InjectionCase = z.infer<typeof injectionCaseSchema>;
export type QuestionInjection = z.infer<typeof questionInjectionSchema>;
export type RouterCase = z.infer<typeof routerCaseSchema>;

/** A JSON file under the repo root, not yet checked for shape. */
export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(repoPath(path), 'utf8'));
}

/** Hostile SQL the validator must refuse, shared with the validator's unit tests. */
export function loadInjectionCases(): InjectionCase[] {
  return z.array(injectionCaseSchema).parse(readJson('workbench/evals/sql/injection-cases.json'));
}

/** Hostile questions the whole path must refuse, from question to response. */
export function loadQuestionInjections(): QuestionInjection[] {
  const cases = z
    .array(questionInjectionSchema)
    .parse(readJson('workbench/evals/sql/question-injections.json'));
  if (new Set(cases.map((injection) => injection.id)).size !== cases.length) {
    throw new Error('workbench/evals/sql/question-injections.json has a repeated id');
  }
  return cases;
}

/** The router only cases, checked for shape and unique ids. */
export function loadRouterCases(): RouterCase[] {
  const cases = z
    .array(routerCaseSchema)
    .parse(readJson('workbench/evals/router/router-cases.json'));
  if (new Set(cases.map((routerCase) => routerCase.id)).size !== cases.length) {
    throw new Error('workbench/evals/router/router-cases.json has a repeated id');
  }
  return cases;
}

/** Where a report is written, relative to the repo root. */
export function reportPath(name: string): string {
  return repoPath(`workbench/evals/reports/${name}`);
}
