import { bearerToken, secretMatches } from './secret-match.js';

describe('secretMatches', () => {
  it('matches only the exact secret', () => {
    expect(secretMatches('s3cret-value', 's3cret-value')).toBe(true);
    expect(secretMatches('s3cret-valuE', 's3cret-value')).toBe(false);
    expect(secretMatches('s3cret', 's3cret-value')).toBe(false);
    expect(secretMatches(undefined, 's3cret-value')).toBe(false);
    expect(secretMatches('', 's3cret-value')).toBe(false);
  });
});

describe('bearerToken', () => {
  it('reads the token from a bearer header', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
    expect(bearerToken('bearer   abc123 ')).toBe('abc123');
    expect(bearerToken('Basic abc123')).toBeUndefined();
    expect(bearerToken(undefined)).toBeUndefined();
  });
});
