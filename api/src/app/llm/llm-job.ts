/** The jobs the app gives a model. Each maps to a model id in the `llm` config. */
export const LLM_JOB = {
  ROUTER: 'router',
  ANSWER: 'answer',
} as const;

export type LlmJob = (typeof LLM_JOB)[keyof typeof LLM_JOB];
