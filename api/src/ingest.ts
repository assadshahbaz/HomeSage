import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { parseIngestArguments } from './app/ingestion/ingest-arguments.js';
import { formatIngestionSummary } from './app/ingestion/ingestion-report.js';
import { IngestionService } from './app/ingestion/ingestion.service.js';
import { AppLogger } from './platform/logging/app-logger.js';

// process.argv starts with the node binary and the script path.
const FIRST_ARGUMENT = 2;

/**
 * `npm run ingest -- --full`: builds, embeds and indexes every property.
 * `--restart` ignores the checkpoint of a stopped run and starts from the
 * first property. `npm run ingest -- --since <timestamp>` does the same for
 * only the properties changed since then. Boots the same application context
 * as the API, so a later scheduled sync runs exactly this code.
 */
async function ingest(): Promise<void> {
  // Parsed before booting, so a mistyped command fails at once.
  const options = parseIngestArguments(process.argv.slice(FIRST_ARGUMENT));

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(AppLogger));
  try {
    const summary = await app.get(IngestionService).run(options);
    console.log(formatIngestionSummary(summary));
  } finally {
    await app.close();
  }
}

await ingest();
