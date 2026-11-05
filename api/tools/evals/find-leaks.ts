// A prompt line shorter than this is too generic to prove a leak on its own.
const MIN_PROMPT_LINE_LENGTH = 30;

/** What a raw MySQL or Node error looks like when it reaches a response body. */
const INTERNAL_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['a MySQL error code', /\bER_[A-Z_]{3,}\b/],
  ['a mysql2 error field', /\b(sqlMessage|sqlState|errno)\b/],
  [
    'a MySQL error message',
    /You have an error in your SQL syntax|Unknown column|Access denied for user/i,
  ],
  ['a stack trace', /\n\s+at [\w.<>]+ \(/],
];

/** The lines of a rendered prompt long enough to be recognisable if they leaked. */
export function promptFingerprints(renderedPrompt: string): string[] {
  return renderedPrompt
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length >= MIN_PROMPT_LINE_LENGTH);
}

/**
 * Everything internal a response body shows: lines of the prompt, which also
 * carries the allow list, and raw database errors or stack traces. Empty when
 * the body is clean.
 */
export function findLeaks(body: string, fingerprints: readonly string[]): string[] {
  const leaks = fingerprints
    .filter((line) => body.includes(line))
    .map((line) => `prompt text: "${line}"`);
  for (const [name, pattern] of INTERNAL_PATTERNS) {
    if (pattern.test(body)) {
      leaks.push(name);
    }
  }
  return leaks;
}
