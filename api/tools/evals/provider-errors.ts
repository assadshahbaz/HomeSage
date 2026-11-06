import { HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';

// Widened on purpose, as in the exception filter: statuses here are plain numbers.
const GATEWAY_TIMEOUT: number = HttpStatus.GATEWAY_TIMEOUT;
const TOO_MANY_REQUESTS: number = HttpStatus.TOO_MANY_REQUESTS;
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

// A quota that resets per day will not come back within one eval run, so
// waiting for it is pointless. Providers word it differently ("PerDay",
// "per day", "TPD", "RPD"), so any of them counts.
const DAILY_QUOTA = /per ?day|\b[TR]PD\b/i;
const PROVIDER_MESSAGE = /"message":\s*"([^".]*)/;
const MAX_REASON_LENGTH = 160;

const statusSchema = z.object({ status: z.number() });

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** True for failures of the model provider rather than of the model's answer. */
export function isProviderFailure(error: unknown): boolean {
  if (error instanceof HttpException) {
    return error.getStatus() === GATEWAY_TIMEOUT;
  }
  const parsed = statusSchema.safeParse(error);
  return (
    parsed.success &&
    (parsed.data.status === TOO_MANY_REQUESTS || parsed.data.status >= SERVER_ERROR_FLOOR)
  );
}

/** True when the provider refused because a per day quota is spent. */
export function isDailyQuotaSpent(error: unknown): boolean {
  const parsed = statusSchema.safeParse(error);
  return (
    parsed.success &&
    parsed.data.status === TOO_MANY_REQUESTS &&
    DAILY_QUOTA.test(errorMessage(error))
  );
}

/** One readable line for the report, rather than the provider's whole error body. */
export function summariseError(error: unknown): string {
  const message = errorMessage(error);
  const parsed = statusSchema.safeParse(error);
  if (!parsed.success) {
    return message.slice(0, MAX_REASON_LENGTH);
  }
  const inner = PROVIDER_MESSAGE.exec(message)?.[1] ?? message;
  return `provider returned ${String(parsed.data.status)}: ${inner.slice(0, MAX_REASON_LENGTH)}`;
}
