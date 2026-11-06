import { Injectable } from '@nestjs/common';
import type { LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Logger } from 'pino';
import { isString } from '../../contracts/index.js';
import type { AppConfig } from '../../infra/config/app.config.js';
import { RequestContextService } from '../request-context/request-context.service.js';
import { toLogFields } from './log-fields.js';
import { createLogger } from './pino-logger.js';

const DEVELOPMENT = 'development';

type PinoLevel = 'info' | 'warn' | 'error' | 'fatal' | 'debug' | 'trace';

/**
 * The logger Nest and every feature writes through. Each line picks up the
 * current request id on its own, so no caller ever passes one.
 */
@Injectable()
export class AppLogger implements LoggerService {
  private readonly logger: Logger;

  public constructor(configService: ConfigService, context: RequestContextService) {
    const { environment, logLevel } = configService.getOrThrow<AppConfig>('app');

    this.logger = createLogger({
      level: logLevel,
      pretty: environment === DEVELOPMENT,
      mixin: () => {
        const requestId = context.getRequestId();
        return requestId === undefined ? {} : { requestId };
      },
    });
  }

  public log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }

  public warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  public error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }

  public fatal(message: unknown, ...params: unknown[]): void {
    this.write('fatal', message, params);
  }

  public debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  public verbose(message: unknown, ...params: unknown[]): void {
    this.write('trace', message, params);
  }

  private write(level: PinoLevel, message: unknown, params: unknown[]): void {
    this.logger[level](toLogFields(params), isString(message) ? message : JSON.stringify(message));
  }
}
