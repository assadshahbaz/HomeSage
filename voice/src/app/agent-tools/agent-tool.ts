import type { ToolName } from './tool-definitions.js';

/** Who is on the line, as Vapi's webhook describes the call. */
export interface CallContext {
  readonly callId: string;
  /** The caller's number from caller ID, or null for a web test call or a withheld number. */
  readonly callerNumber: string | null;
}

/**
 * What a tool hands back. A `result` is read by the model, including a refusal
 * it can recover from, such as a slot that has just gone. An `error` makes Vapi
 * say its failure line, so it is kept for faults the caller cannot fix.
 */
export type ToolOutcome =
  | { readonly kind: 'result'; readonly text: string }
  | { readonly kind: 'error'; readonly text: string };

/** One tool the phone agent can call, taking arguments already checked against its schema. */
export interface AgentTool<Args> {
  readonly name: ToolName;
  run(args: Args, call: CallContext): Promise<ToolOutcome>;
}

/** A refusal the model can act on: what was wrong and what to do next. */
export function notDone(reason: string): ToolOutcome {
  return { kind: 'result', text: `Not done: ${reason}` };
}

/** A finished action, with what the model should tell the caller. */
export function done(text: string): ToolOutcome {
  return { kind: 'result', text };
}
