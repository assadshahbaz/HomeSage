import * as z from 'zod';

// The parts of HomeSage's `POST /chat` stream this service reads. HomeSage owns
// the full contract; these schemas name only the fields used here and let the
// rest through, so a field HomeSage adds later does not break a call.

/** A listing as HomeSage's retrieval event describes it. */
export const homesagePropertySchema = z.object({
  id: z.string().regex(/^\d+$/),
  address: z.string().min(1),
  price: z.number().int().nonnegative(),
  bedrooms: z.number().int().nonnegative().nullable(),
});

export const homesageChatEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('route') }),
  z.object({
    type: z.literal('retrieval'),
    kind: z.string(),
    properties: z.array(homesagePropertySchema).optional(),
  }),
  z.object({ type: z.literal('token'), text: z.string() }),
  z.object({
    type: z.literal('citations'),
    kind: z.string(),
    ids: z.array(z.string()).optional(),
  }),
  z.object({ type: z.literal('done') }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);

export type HomesageProperty = z.infer<typeof homesagePropertySchema>;
export type HomesageChatEvent = z.infer<typeof homesageChatEventSchema>;
