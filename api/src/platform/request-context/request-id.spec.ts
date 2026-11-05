import { describe, expect, it } from 'vitest';
import { toRequestId } from './request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('toRequestId', () => {
  it.each([
    'abc123',
    '7f3c1e8a-2b4d-4f6a-9c1e-5d8b3a2f7e10',
    'req_1234567890',
    'trace-id-with-dashes',
    'a',
    'A'.repeat(64),
  ])('keeps the caller id %p', (inbound) => {
    expect(toRequestId(inbound)).toBe(inbound);
  });

  it.each([
    ['empty', ''],
    ['too long', 'A'.repeat(65)],
    ['a newline', 'abc\ndef'],
    ['a carriage return', 'abc\rdef'],
    ['a space', 'abc def'],
    ['a tab', 'abc\tdef'],
    ['a null byte', 'abc\u0000def'],
    ['an escape sequence', 'abc\u001b[31mdef'],
    ['json', '{"requestId":"abc"}'],
    ['a slash', 'abc/def'],
    ['a colon', 'level:error'],
  ])('replaces an id with %s', (_label, inbound) => {
    const id = toRequestId(inbound);

    expect(id).not.toBe(inbound);
    expect(id).toMatch(UUID);
  });

  it.each([
    ['nothing', undefined],
    ['a repeated header', ['abc', 'def']],
    ['a number', 7],
    ['null', null],
  ])('generates one when the header is %s', (_label, inbound) => {
    expect(toRequestId(inbound)).toMatch(UUID);
  });

  it('generates a different id each time', () => {
    expect(toRequestId(undefined)).not.toBe(toRequestId(undefined));
  });
});
