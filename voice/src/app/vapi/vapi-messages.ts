import * as z from 'zod';

// The parts of Vapi's server messages this service reads. Vapi sends far more
// than this and adds fields over time, so every object lets unknown keys
// through and only the fields named here are trusted.

const callSchema = z
  .object({
    id: z.string().min(1),
    customer: z.object({ number: z.string().nullish() }).loose().nullish(),
    startedAt: z.string().nullish(),
    endedAt: z.string().nullish(),
  })
  .loose();

// Vapi's docs show both shapes: arguments under `function`, or `name` and
// `parameters` on the call itself. Arguments may also arrive as a JSON string.
const toolCallSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().optional(),
    parameters: z.unknown().optional(),
    function: z.object({ name: z.string(), arguments: z.unknown().optional() }).loose().optional(),
  })
  .loose()
  .transform((toolCall, context) => {
    const name = toolCall.function?.name ?? toolCall.name;
    if (name === undefined) {
      context.addIssue({ code: 'custom', message: 'A tool call has no name' });
      return z.NEVER;
    }
    return {
      id: toolCall.id,
      name,
      args: parseArguments(toolCall.function?.arguments ?? toolCall.parameters),
    };
  });

export const toolCallsMessageSchema = z
  .object({
    type: z.literal('tool-calls'),
    call: callSchema,
    toolCallList: z.array(toolCallSchema),
  })
  .loose();

export const endOfCallReportSchema = z
  .object({
    type: z.literal('end-of-call-report'),
    call: callSchema,
    endedReason: z.string().nullish(),
    startedAt: z.string().nullish(),
    endedAt: z.string().nullish(),
    summary: z.string().nullish(),
    transcript: z.string().nullish(),
    analysis: z.object({ summary: z.string().nullish() }).loose().nullish(),
    artifact: z.object({ transcript: z.string().nullish() }).loose().nullish(),
  })
  .loose();

/** Any server message: only its type is read until the type is known. */
export const serverMessageEnvelopeSchema = z.object({
  message: z.object({ type: z.string() }).loose(),
});

export type ToolCallsMessage = z.infer<typeof toolCallsMessageSchema>;
export type EndOfCallReport = z.infer<typeof endOfCallReportSchema>;

/** One entry of the response to a `tool-calls` message. */
export type ToolCallResult =
  | { readonly toolCallId: string; readonly name: string; readonly result: string }
  | { readonly toolCallId: string; readonly name: string; readonly error: string };

function parseArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') {
    return raw ?? {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Left as the string, so the tool's schema reports it as the wrong shape.
    return raw;
  }
}
