import * as z from 'zod';

/** State of one backing service as reported by `/health`. */
export const serviceHealthSchema = z.object({
  name: z.string(),
  status: z.enum(['up', 'down']),
  latencyMs: z.number().nonnegative().optional(),
});

/** Response body of `GET /health`. */
export const healthResponseSchema = z.object({
  status: z.enum(['up', 'down']),
  services: z.array(serviceHealthSchema),
});

export type ServiceHealth = z.infer<typeof serviceHealthSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
