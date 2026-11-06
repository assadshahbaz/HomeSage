import { z } from 'zod';

// mysql2 puts these on errors the server returned for a statement. A lost or
// refused connection has neither, which is how the two are told apart.
const queryErrorSchema = z.object({ errno: z.number(), sqlMessage: z.string() });

/**
 * MySQL's own message when `error` is the server refusing or stopping a
 * statement, such as a GROUP BY mistake or the statement timeout. Undefined
 * for anything else, since a connection failure is nothing the model can fix.
 */
export function mysqlQueryErrorMessage(error: unknown): string | undefined {
  const parsed = queryErrorSchema.safeParse(error);
  return parsed.success ? parsed.data.sqlMessage : undefined;
}
