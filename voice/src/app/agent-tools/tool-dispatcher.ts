import { Injectable, Logger } from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import type * as z from 'zod';
import { notDone } from './agent-tool.js';
import type { AgentTool, CallContext, ToolOutcome } from './agent-tool.js';
import { BookViewingTool } from './book-viewing.tool.js';
import { GetViewingSlotsTool } from './get-viewing-slots.tool.js';
import { RequestValuationTool } from './request-valuation.tool.js';
import { SearchPropertiesTool } from './search-properties.tool.js';
import { TakeMessageTool } from './take-message.tool.js';
import {
  bookViewingArgs,
  getViewingSlotsArgs,
  requestValuationArgs,
  searchPropertiesArgs,
  takeMessageArgs,
} from './tool-definitions.js';

type Runner = (rawArgs: unknown, call: CallContext) => Promise<ToolOutcome>;

/** Said by Vapi's failure line, so it never names what broke. */
export const TOOL_FAULT_MESSAGE = 'The system had a problem completing that.';

/**
 * Routes a tool call to its tool, after checking the arguments against the
 * same schema the model was shown. Arguments that do not fit come back as a
 * result naming the problem, so the model can correct them and call again; an
 * unexpected fault comes back as an error, which Vapi tells the caller about.
 */
@Injectable()
export class ToolDispatcher {
  private readonly logger = new Logger(ToolDispatcher.name);
  private readonly runners: ReadonlyMap<string, Runner>;

  public constructor(
    search: SearchPropertiesTool,
    slots: GetViewingSlotsTool,
    book: BookViewingTool,
    valuation: RequestValuationTool,
    message: TakeMessageTool,
  ) {
    this.runners = new Map([
      runner(searchPropertiesArgs, search),
      runner(getViewingSlotsArgs, slots),
      runner(bookViewingArgs, book),
      runner(requestValuationArgs, valuation),
      runner(takeMessageArgs, message),
    ]);
  }

  /** Runs the named tool. Never throws. */
  public async dispatch(name: string, rawArgs: unknown, call: CallContext): Promise<ToolOutcome> {
    const run = this.runners.get(name);
    if (run === undefined) {
      this.logger.warn(`Unknown tool called: ${name}`);
      return notDone(`there is no tool called ${name}.`);
    }
    const startedAt = performance.now();
    try {
      const outcome = await run(rawArgs, call);
      // Never the arguments or the result: they hold callers' names and numbers.
      this.logger.log(
        `${name} ${outcome.kind} in ${Math.round(performance.now() - startedAt)}ms for call ${call.callId}`,
      );
      return outcome;
    } catch (error) {
      this.logger.error(
        `${name} failed for call ${call.callId}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      );
      return { kind: 'error', text: TOOL_FAULT_MESSAGE };
    }
  }
}

function runner<Args>(schema: z.ZodType<Args>, tool: AgentTool<Args>): [string, Runner] {
  return [
    tool.name,
    async (rawArgs, call) => {
      const parsed = schema.safeParse(rawArgs);
      if (!parsed.success) {
        const problems = parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'arguments'}: ${issue.message}`)
          .join('; ');
        return notDone(`the arguments were not valid (${problems}). Correct them and call again.`);
      }
      return tool.run(parsed.data, call);
    },
  ];
}
