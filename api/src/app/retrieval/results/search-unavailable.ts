import { errors } from '@elastic/elasticsearch';
import { HttpStatus } from '@nestjs/common';

// Widened on purpose, as in the exception filter: statuses here are plain numbers.
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;
const NOT_FOUND: number = HttpStatus.NOT_FOUND;

/**
 * Elasticsearch is down, too slow, failing on its side, or has no index yet.
 * The index is derived and rebuilt by ingestion, so a missing one means search
 * is not available yet rather than that the request was wrong.
 */
export function isSearchUnavailable(error: unknown): boolean {
  if (
    error instanceof errors.ConnectionError ||
    error instanceof errors.TimeoutError ||
    error instanceof errors.NoLivingConnectionsError
  ) {
    return true;
  }
  return (
    error instanceof errors.ResponseError &&
    (error.statusCode === undefined ||
      error.statusCode >= SERVER_ERROR_FLOOR ||
      error.statusCode === NOT_FOUND)
  );
}
