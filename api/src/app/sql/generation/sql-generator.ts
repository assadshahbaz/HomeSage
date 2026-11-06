import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import { LLM_JOB } from '../../llm/llm-job.js';
import { LlmService } from '../../llm/llm.service.js';
import { PromptLoader } from '../../llm/prompts/prompt-loader.js';
import type { Prompt } from '../../llm/prompts/prompt-loader.js';
import { extractSql } from './sql-extraction.js';
import type { SqlGenerationResult } from './sql-generation-result.js';
import { renderSqlPrompt } from './sql-prompt.js';
import { SqlValidator } from '../validation/sql-validator.js';

const PROMPTS_DIRECTORY = fileURLToPath(new URL('./prompts/', import.meta.url));
const SQL_PROMPT = { name: 'sql', version: 4 } as const;

// The cap covers the model's thinking as well as the query, and thinking can
// take most of it, so it is set well above what one SELECT needs.
const SQL_MAX_TOKENS = 4096;

/** A query that ran and failed, shown to the model for its one correction. */
export interface FailedAttempt {
  readonly sql: string;
  readonly error: string;
}

// The prompt's word for a question the data cannot answer. Trailing
// punctuation is tolerated, anything else around it is not.
const DECLINED = /^CANNOT_ANSWER\W*$/;

/**
 * Turns a question into SQL that is safe to run, or says why it is not. The
 * model's text never leaves this class unchecked: it goes through the
 * validator first, and only the validator's rewrite comes back as `valid`.
 */
@Injectable()
export class SqlGenerator {
  public constructor(
    private readonly llm: LlmService,
    private readonly prompts: PromptLoader,
    private readonly validator: SqlValidator,
  ) {}

  /**
   * Asks the model for SQL answering `question`, then validates it. With a
   * `failed` attempt, the model sees the query that failed and MySQL's error,
   * and is asked for a corrected query instead.
   */
  public async generate(question: string, failed?: FailedAttempt): Promise<SqlGenerationResult> {
    const { text } = await this.llm.complete({
      // SQL is written by the stronger of the two configured models; the
      // router model is kept for classification.
      job: LLM_JOB.ANSWER,
      prompt: await this.prompt(),
      data: failed
        ? { question, failed_query: failed.sql, database_error: failed.error }
        : { question },
      maxTokens: SQL_MAX_TOKENS,
    });

    const candidate = extractSql(text);
    if (DECLINED.test(candidate)) {
      return { status: 'declined' };
    }

    const verdict = this.validator.validate(candidate);
    return verdict.ok
      ? { status: 'valid', sql: verdict.sql, shape: verdict.shape }
      : { status: 'rejected', reason: verdict.reason, detail: verdict.detail, candidate };
  }

  private async prompt(): Promise<Prompt> {
    const template = await this.prompts.load(
      PROMPTS_DIRECTORY,
      SQL_PROMPT.name,
      SQL_PROMPT.version,
    );
    return { ...template, text: renderSqlPrompt(template.text) };
  }
}
