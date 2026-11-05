import { describe, expect, it } from 'vitest';
import { RequestContextService } from '../request-context/request-context.service.js';
import { createLogger } from './pino-logger.js';

const REQUEST_ID = 'req-abc-123';

function readable(): { lines: Record<string, unknown>[]; write: (line: string) => void } {
  const lines: Record<string, unknown>[] = [];

  return {
    lines,
    write: (line: string) => {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
}

describe('createLogger', () => {
  it('puts the text under a key a log search can read', () => {
    const stream = readable();
    createLogger({ level: 'info', pretty: false, mixin: () => ({}) }, stream).info('hello');

    expect(stream.lines[0]).toMatchObject({ message: 'hello', level: 'info' });
  });

  it('stamps every line with whatever the mixin returns at the time', () => {
    const stream = readable();
    const context = new RequestContextService();
    const logger = createLogger(
      {
        level: 'info',
        pretty: false,
        mixin: () => {
          const requestId = context.getRequestId();
          return requestId === undefined ? {} : { requestId };
        },
      },
      stream,
    );

    logger.info('before');
    context.run({ requestId: REQUEST_ID }, () => {
      logger.info('during');
      logger.error('also during');
    });
    logger.info('after');

    expect(stream.lines.map((line) => line['requestId'])).toEqual([
      undefined,
      REQUEST_ID,
      REQUEST_ID,
      undefined,
    ]);
  });

  it('writes the level as a word rather than a number', () => {
    const stream = readable();
    const logger = createLogger({ level: 'trace', pretty: false, mixin: () => ({}) }, stream);

    logger.trace('a');
    logger.fatal('b');

    expect(stream.lines.map((line) => line['level'])).toEqual(['trace', 'fatal']);
  });

  it('drops lines below the configured level', () => {
    const stream = readable();
    const logger = createLogger({ level: 'warn', pretty: false, mixin: () => ({}) }, stream);

    logger.info('quiet');
    logger.warn('loud');

    expect(stream.lines.map((line) => line['message'])).toEqual(['loud']);
  });

  it.each(['apiKey', 'password', 'authorization'])('redacts %s', (field) => {
    const stream = readable();
    const logger = createLogger({ level: 'info', pretty: false, mixin: () => ({}) }, stream);

    logger.info({ [field]: 'sk-ant-secret' }, 'provider call failed');

    expect(JSON.stringify(stream.lines[0])).not.toContain('sk-ant-secret');
    expect(stream.lines[0]).toMatchObject({ [field]: '[redacted]' });
  });

  it('redacts a secret nested one level down', () => {
    const stream = readable();
    const logger = createLogger({ level: 'info', pretty: false, mixin: () => ({}) }, stream);

    logger.info({ detail: { apiKey: 'sk-ant-secret' } }, 'provider call failed');

    expect(JSON.stringify(stream.lines[0])).not.toContain('sk-ant-secret');
  });
});
