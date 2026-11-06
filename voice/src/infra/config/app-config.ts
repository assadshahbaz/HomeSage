import type { Env } from './env.validation.js';

/** The server's settings, grouped by the feature that reads them. */
export interface AppConfig {
  readonly port: number;
  readonly homesage: { readonly url: string; readonly timeoutMs: number };
  readonly webhookSecret: string;
  readonly adminToken: string;
  readonly dbPath: string;
  readonly agency: { readonly name: string; readonly timeZone: string };
  readonly viewings: ViewingConfig;
  readonly notify: { readonly webhookUrl: string | null; readonly timeoutMs: number };
  readonly callMemoryTtlMs: number;
}

/** When the agency runs viewings, and how many times one answer offers. */
export interface ViewingConfig {
  /** 0 is Sunday, 6 is Saturday. */
  readonly days: readonly number[];
  /** First slot of the day, 24 hour HH:MM. */
  readonly start: string;
  /** No slot starts at or after this time. */
  readonly end: string;
  readonly slotMinutes: number;
  readonly daysAhead: number;
  readonly slotsOffered: number;
}

const MS_PER_MINUTE = 60_000;

/** Groups the validated environment into the shape the features read. */
export function toAppConfig(env: Env): AppConfig {
  return {
    port: env.PORT,
    // A trailing slash would double up when paths are joined on.
    homesage: { url: env.HOMESAGE_URL.replace(/\/+$/, ''), timeoutMs: env.HOMESAGE_TIMEOUT_MS },
    webhookSecret: env.VOICE_WEBHOOK_SECRET,
    adminToken: env.ADMIN_TOKEN,
    dbPath: env.DB_PATH,
    agency: { name: env.AGENCY_NAME, timeZone: env.AGENCY_TIMEZONE },
    viewings: {
      days: env.VIEWING_DAYS,
      start: env.VIEWING_START,
      end: env.VIEWING_END,
      slotMinutes: env.VIEWING_SLOT_MINUTES,
      daysAhead: env.VIEWING_DAYS_AHEAD,
      slotsOffered: env.VIEWING_SLOTS_OFFERED,
    },
    notify: { webhookUrl: env.NOTIFY_WEBHOOK_URL ?? null, timeoutMs: env.NOTIFY_TIMEOUT_MS },
    callMemoryTtlMs: env.CALL_MEMORY_TTL_MINUTES * MS_PER_MINUTE,
  };
}
