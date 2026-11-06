import * as z from 'zod';

const DEFAULT_PORT = 3100;
const DEFAULT_HOMESAGE_TIMEOUT_MS = 15_000;
const DEFAULT_NOTIFY_TIMEOUT_MS = 5_000;
const DEFAULT_SLOT_MINUTES = 30;
const DEFAULT_DAYS_AHEAD = 14;
const DEFAULT_SLOTS_OFFERED = 4;
const DEFAULT_CALL_MEMORY_TTL_MINUTES = 120;
const MAX_SLOTS_OFFERED = 10;
const MAX_DAYS_AHEAD = 60;
// Long enough that guessing it is hopeless, short enough to paste into a dashboard.
const MIN_SECRET_LENGTH = 24;
const LAST_WEEKDAY = 6;
// Monday to Saturday.
const DEFAULT_VIEWING_DAYS = '1,2,3,4,5,6';

// An optional string. A line left blank in .env, such as `NOTIFY_WEBHOOK_URL=`,
// reads as unset rather than as an empty value.
function blankAsUnset<T extends z.ZodType>(schema: T): z.ZodPreprocess<z.ZodOptional<T>> {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const clockTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24 hour HH:MM, such as 09:30');

const weekdays = z
  .string()
  .trim()
  .transform((value) => value.split(',').map((day) => Number(day.trim())))
  .pipe(
    z
      .array(z.number().int().min(0).max(LAST_WEEKDAY))
      .min(1, 'List at least one day, 0 for Sunday to 6 for Saturday'),
  );

const timeZone = z.string().refine(
  (zone) => {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Not an IANA time zone, such as Europe/London' },
);

/**
 * Every environment variable the server reads. Parsed once at boot, so a
 * missing or malformed value stops the process with its name, rather than
 * surfacing in the middle of a phone call.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),

    // Where HomeSage's API runs, such as http://127.0.0.1:3000.
    HOMESAGE_URL: z.url(),
    // HomeSage answers in a few seconds; the caller hears a holding line meanwhile.
    HOMESAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_HOMESAGE_TIMEOUT_MS),

    // Vapi sends this with every webhook, as `X-Vapi-Secret` or a bearer token.
    VOICE_WEBHOOK_SECRET: z.string().min(MIN_SECRET_LENGTH),
    // Bearer token for the /admin endpoints, which hold callers' details.
    ADMIN_TOKEN: z.string().min(MIN_SECRET_LENGTH),

    DB_PATH: z.string().min(1).default('data/voice.db'),

    AGENCY_NAME: z.string().trim().min(1).default('HomeSage Estates'),
    AGENCY_TIMEZONE: timeZone.default('Europe/London'),

    // 0 is Sunday, 6 is Saturday.
    VIEWING_DAYS: weekdays.prefault(DEFAULT_VIEWING_DAYS),
    VIEWING_START: clockTime.default('10:00'),
    VIEWING_END: clockTime.default('17:00'),
    VIEWING_SLOT_MINUTES: z.coerce.number().int().positive().default(DEFAULT_SLOT_MINUTES),
    VIEWING_DAYS_AHEAD: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_DAYS_AHEAD)
      .default(DEFAULT_DAYS_AHEAD),
    VIEWING_SLOTS_OFFERED: z.coerce
      .number()
      .int()
      .positive()
      .max(MAX_SLOTS_OFFERED)
      .default(DEFAULT_SLOTS_OFFERED),

    // Slack incoming webhook, Make, n8n, Zapier or anything that takes a JSON POST.
    NOTIFY_WEBHOOK_URL: blankAsUnset(z.url()),
    NOTIFY_TIMEOUT_MS: z.coerce.number().int().positive().default(DEFAULT_NOTIFY_TIMEOUT_MS),

    CALL_MEMORY_TTL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .default(DEFAULT_CALL_MEMORY_TTL_MINUTES),
  })
  .refine((env) => env.VIEWING_START < env.VIEWING_END, {
    message: 'VIEWING_START must be before VIEWING_END',
    path: ['VIEWING_START'],
  });

export type Env = z.infer<typeof envSchema>;

/** Parses the environment, or throws naming every variable at fault. */
export function validateEnv(source: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return parsed.data;
}
