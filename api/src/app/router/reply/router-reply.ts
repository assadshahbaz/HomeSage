import type * as z from 'zod';
import { ROUTE_FALLBACK, routerReplySchema } from '../../../contracts/index.js';
import type { RouterReply } from '../../../contracts/index.js';

/** The router reply read and checked, or why it could not be. */
export type ReadRouterReply =
  | { readonly ok: true; readonly reply: RouterReply }
  | { readonly ok: false; readonly reason: typeof ROUTE_FALLBACK.PARSE_FAILURE }
  | {
      readonly ok: false;
      readonly reason: typeof ROUTE_FALLBACK.SCHEMA_FAILURE;
      /** Where the reply broke the schema, as dotted paths. Never the model's text. */
      readonly issues: readonly string[];
    };

/**
 * Reads the JSON object out of the router model's text and checks it against
 * the router reply schema. The object is taken from the first `{` to the last
 * `}`, so a code fence or a sentence around it does not matter, but two
 * objects or a broken one are a parse failure.
 */
export function readRouterReply(text: string): ReadRouterReply {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end < start) {
    return { ok: false, reason: ROUTE_FALLBACK.PARSE_FAILURE };
  }

  let json: unknown;
  try {
    json = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, reason: ROUTE_FALLBACK.PARSE_FAILURE };
  }

  const parsed = routerReplySchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      reason: ROUTE_FALLBACK.SCHEMA_FAILURE,
      issues: parsed.error.issues.map((issue) => issuePath(issue)),
    };
  }
  return { ok: true, reply: parsed.data };
}

function issuePath(issue: z.core.$ZodIssue): string {
  return issue.path.length === 0 ? '(root)' : issue.path.map(String).join('.');
}
