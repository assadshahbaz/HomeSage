import { pino } from 'pino';
import type { DestinationStream, Logger, LoggerOptions } from 'pino';

/** What the logger needs to know, independent of where the values came from. */
export interface LoggerSettings {
  level: string;
  /** Human readable output for a terminal. JSON everywhere else. */
  pretty: boolean;
  /** Fields added to every line, read fresh each time. */
  mixin: () => Record<string, unknown>;
}

const BASE: LoggerOptions = {
  // The default keys are single letters, which read badly in a log search.
  messageKey: 'message',
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  // Nothing here should ever reach a log line, whatever a caller passes.
  redact: {
    paths: ['apiKey', 'password', 'authorization', '*.apiKey', '*.password', '*.authorization'],
    censor: '[redacted]',
  },
};

/** Builds the root pino logger. `destination` is the seam a test reads lines back through. */
export function createLogger(settings: LoggerSettings, destination?: DestinationStream): Logger {
  const options: LoggerOptions = { ...BASE, level: settings.level, mixin: settings.mixin };

  if (destination) {
    return pino(options, destination);
  }

  if (settings.pretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          // pino-pretty looks for `msg` unless told which key carries the text.
          messageKey: BASE.messageKey,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          singleLine: true,
        },
      },
    });
  }

  return pino(options);
}
