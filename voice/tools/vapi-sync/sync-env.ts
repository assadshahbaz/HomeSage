import * as z from 'zod';

const MIN_SECRET_LENGTH = 24;
// Vapi's limit on an assistant's name.
const MAX_ASSISTANT_NAME = 40;

function blankAsUnset<T extends z.ZodType>(schema: T): z.ZodPreprocess<z.ZodOptional<T>> {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

/** Settings the sync script reads. The server never reads the Vapi ones. */
export const syncEnvSchema = z.object({
  VAPI_API_KEY: z.string().min(1),
  VAPI_ASSISTANT_NAME: z.string().trim().min(1).max(MAX_ASSISTANT_NAME).default('HomeSage Voice'),
  // The public HTTPS address of this server, such as an ngrok URL.
  PUBLIC_URL: z
    .url({ protocol: /^https$/, error: 'PUBLIC_URL must be an https address Vapi can reach' })
    .transform((url) => url.replace(/\/+$/, '')),
  VOICE_WEBHOOK_SECRET: z.string().min(MIN_SECRET_LENGTH),
  // A Vapi custom credential holding VOICE_WEBHOOK_SECRET; without one the secret goes in a header.
  VAPI_CREDENTIAL_ID: blankAsUnset(z.string().min(1)),
  AGENCY_NAME: z.string().trim().min(1).default('HomeSage Estates'),
  VAPI_MODEL_PROVIDER: z.string().trim().min(1).default('openai'),
  VAPI_MODEL: z.string().trim().min(1).default('gpt-4.1-mini'),
  VAPI_VOICE_PROVIDER: blankAsUnset(z.string().trim().min(1)),
  VAPI_VOICE_ID: blankAsUnset(z.string().trim().min(1)),
  // E.164, such as +441632960999. Leave unset and the agent takes messages instead.
  TRANSFER_PHONE_NUMBER: blankAsUnset(
    z.string().regex(/^\+[1-9]\d{6,14}$/, 'Use E.164, such as +441632960999'),
  ),
});

export type SyncEnv = z.infer<typeof syncEnvSchema>;

/** Parses the environment, or throws naming every variable at fault. */
export function parseSyncEnv(source: Record<string, string | undefined>): SyncEnv {
  const parsed = syncEnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment for the Vapi sync:\n${problems}`);
  }
  if (
    (parsed.data.VAPI_VOICE_PROVIDER === undefined) !==
    (parsed.data.VAPI_VOICE_ID === undefined)
  ) {
    throw new Error('Set both VAPI_VOICE_PROVIDER and VAPI_VOICE_ID, or neither');
  }
  return parsed.data;
}
