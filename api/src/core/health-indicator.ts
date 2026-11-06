/**
 * One backing service that `/health` can ask whether it is alive. Implemented
 * by the infra adapter that owns the connection, never by the health feature.
 */
export interface HealthIndicator {
  /** How the service appears in the response, for example `mysql`. */
  readonly name: string;

  /** Resolves when the service answered, throws when it did not. */
  ping(): Promise<void>;
}
