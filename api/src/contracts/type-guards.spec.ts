import { describe, expect, it } from 'vitest';
import { isRecord, isString } from './type-guards.js';

describe('isString', () => {
  it.each(['', 'P-1234', '0', 'false', ' '])('accepts %p', (value) => {
    expect(isString(value)).toBe(true);
  });

  it.each([
    ['a number', 7],
    ['a boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
    ['an array of strings', ['a']],
    ['a String object', new String('boxed')],
  ])('rejects %s', (_label, value) => {
    expect(isString(value)).toBe(false);
  });
});

describe('isRecord', () => {
  it.each([
    ['an empty object', {}],
    ['a populated object', { id: 1 }],
    ['an object with no prototype', Object.create(null) as object],
    ['an error', new Error('boom')],
    ['a date', new Date()],
  ])('accepts %s', (_label, value) => {
    expect(isRecord(value)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['a populated array', [1, 2]],
    ['a string', 'text'],
    ['a number', 7],
  ])('rejects %s', (_label, value) => {
    expect(isRecord(value)).toBe(false);
  });
});
