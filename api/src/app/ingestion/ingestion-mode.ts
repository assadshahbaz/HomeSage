/** Every property, or only those changed since a moment. */
export const INGESTION_MODE = {
  FULL: 'full',
  SINCE: 'since',
} as const;

export type IngestionMode = (typeof INGESTION_MODE)[keyof typeof INGESTION_MODE];

/** How a run should start. */
export type IngestionOptions =
  | {
      readonly mode: typeof INGESTION_MODE.FULL;
      /** Ignore any checkpoint and index every property from the first. */
      readonly restart: boolean;
    }
  | {
      readonly mode: typeof INGESTION_MODE.SINCE;
      /** Index only properties whose `updated_at` is at or after this. */
      readonly since: Date;
    };
