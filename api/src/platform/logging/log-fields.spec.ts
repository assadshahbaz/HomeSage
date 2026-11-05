import { describe, expect, it } from 'vitest';
import { toLogFields } from './log-fields.js';

describe('toLogFields', () => {
  it('has nothing to add when there are no trailing arguments', () => {
    expect(toLogFields([])).toEqual({});
  });

  it('reads the source class Nest passes last', () => {
    expect(toLogFields(['RouterExplorer'])).toEqual({ source: 'RouterExplorer' });
  });

  it('keeps the stack Nest puts in front of the source', () => {
    const stack = 'Error: boom\n    at bootstrap (main.ts:1:1)';

    expect(toLogFields([stack, 'AllExceptionsFilter'])).toEqual({
      detail: stack,
      source: 'AllExceptionsFilter',
    });
  });

  it('spreads an object of fields onto the line', () => {
    expect(toLogFields([{ statusCode: 200, durationMs: 12 }, 'RequestLogging'])).toEqual({
      statusCode: 200,
      durationMs: 12,
      source: 'RequestLogging',
    });
  });

  it('merges several objects of fields', () => {
    expect(toLogFields([{ a: 1 }, { b: 2 }])).toEqual({ a: 1, b: 2 });
  });

  it('keeps an array whole rather than spreading its indexes', () => {
    expect(toLogFields([['a', 'b']])).toEqual({ detail: ['a', 'b'] });
  });

  it.each([
    ['a number', 42],
    ['null', null],
    ['a boolean', false],
  ])('parks %s under detail', (_label, param) => {
    expect(toLogFields([param])).toEqual({ detail: param });
  });

  it('does not mistake a lone string for a source when it is one of several', () => {
    expect(toLogFields([{ durationMs: 12 }, 'RequestLogging'])).not.toHaveProperty('detail');
  });
});
