import { z } from 'zod';
import { chatIntentSchema } from '../../src/contracts/index.ts';

/**
 * How the router should read a question. Some questions fairly fit more than
 * one intent ("a brand new home" is semantic, or hybrid with the new build
 * flag), so `intents` lists every acceptable one. `filters` holds the filters
 * that must come back with exactly these values, in the data's spelling; any
 * other filter the router adds counts against its precision.
 */
export const routeExpectationSchema = z.strictObject({
  intents: z.array(chatIntentSchema).min(1),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export type RouteExpectation = z.infer<typeof routeExpectationSchema>;
