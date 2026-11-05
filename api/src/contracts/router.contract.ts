import * as z from 'zod';
import { chatIntentSchema } from './chat.contract.js';

/**
 * The JSON the router model must reply with. Only `intent` is required: a reply
 * without it says nothing usable. Everything else may be missing or null, and
 * the router fills it from the question. Filters are kept as a loose record
 * here because each one is checked on its own, so one bad value costs that
 * filter and not the whole reading. Unknown top level keys are ignored.
 */
export const routerReplySchema = z.object({
  intent: chatIntentSchema,
  filters: z.record(z.string(), z.unknown()).nullish(),
  /** What to search by meaning; empty for a purely structured question. */
  semanticQuery: z.string().nullish(),
  /** The question rewritten to stand on its own, using the recent turns. */
  standaloneQuestion: z.string().nullish(),
  /** Earlier listings a follow up refers to, as `P-1234` or `1234`. */
  propertyIds: z.array(z.string()).nullish(),
});

export type RouterReply = z.infer<typeof routerReplySchema>;
