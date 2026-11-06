import { parseRuntimeConfig } from './runtime-config';

describe('parseRuntimeConfig', () => {
  it('accepts a same origin path', () => {
    expect(parseRuntimeConfig('{ "apiBaseUrl": "/api" }')).toEqual({ apiBaseUrl: '/api' });
  });

  it('accepts an absolute http or https URL', () => {
    expect(parseRuntimeConfig('{ "apiBaseUrl": "https://api.example.com" }').apiBaseUrl).toBe(
      'https://api.example.com',
    );
    expect(parseRuntimeConfig('{ "apiBaseUrl": "http://localhost:3000" }').apiBaseUrl).toBe(
      'http://localhost:3000',
    );
  });

  it('defaults to /api when the field is missing', () => {
    expect(parseRuntimeConfig('{}')).toEqual({ apiBaseUrl: '/api' });
  });

  it('removes trailing slashes so paths can be appended with one slash', () => {
    expect(parseRuntimeConfig('{ "apiBaseUrl": "/api/" }').apiBaseUrl).toBe('/api');
    expect(parseRuntimeConfig('{ "apiBaseUrl": "https://api.example.com//" }').apiBaseUrl).toBe(
      'https://api.example.com',
    );
  });

  it.each([
    ['a script URL', '"javascript:alert(1)"'],
    ['a protocol relative URL', '"//evil.example.com"'],
    ['a bare host', '"api.example.com"'],
    ['an empty string', '""'],
    ['a number', '42'],
  ])('rejects %s and names the field', (_label, value) => {
    expect(() => parseRuntimeConfig(`{ "apiBaseUrl": ${value} }`)).toThrow(/apiBaseUrl/);
  });

  it('rejects an unknown key, which is usually a typo', () => {
    expect(() => parseRuntimeConfig('{ "apiBaseURL": "/api" }')).toThrow(/apiBaseURL/);
  });

  it('rejects a file that is not an object', () => {
    expect(() => parseRuntimeConfig('[]')).toThrow(/config\.json is invalid/);
  });

  it('rejects text that is not JSON', () => {
    expect(() => parseRuntimeConfig('apiBaseUrl: /api')).toThrow(/config\.json is not valid JSON/);
  });
});
