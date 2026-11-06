import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Specs run from the web folder, so the stylesheet is read from its source path.
const STYLES = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

/** Text on surface pairs that must reach WCAG AA for normal text. */
const TEXT_PAIRS = [
  ['ink', 'surface'],
  ['ink', 'surface-raised'],
  ['ink', 'surface-sunken'],
  ['ink-muted', 'surface'],
  ['ink-muted', 'surface-raised'],
  ['ink-muted', 'surface-sunken'],
  ['danger', 'surface'],
  ['accent', 'surface'],
  ['on-accent', 'accent'],
  ['on-accent', 'accent-hover'],
] as const;

const MIN_TEXT_CONTRAST = 4.5;

function tokensIn(blockStart: string): Map<string, string> {
  const start = STYLES.indexOf(blockStart);
  const block = STYLES.slice(start, STYLES.indexOf('}', start));
  const tokens = new Map<string, string>();
  for (const [, name, hex] of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6});/gi)) {
    tokens.set(name, hex);
  }
  return tokens;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const THEMES = {
  light: tokensIn('@theme {'),
  dark: tokensIn("[data-theme='dark'] {"),
};

describe('theme tokens', () => {
  it('finds tokens in both themes', () => {
    expect(THEMES.light.size).toBeGreaterThan(0);
    expect(THEMES.dark.size).toBeGreaterThan(0);
  });

  it('redefines every light token for dark mode', () => {
    expect([...THEMES.dark.keys()].sort()).toEqual([...THEMES.light.keys()].sort());
  });

  describe.each(Object.entries(THEMES))('%s theme', (_theme, tokens) => {
    it.each(TEXT_PAIRS)('%s on %s reaches 4.5:1', (text, surface) => {
      expect(contrast(tokens.get(text)!, tokens.get(surface)!)).toBeGreaterThanOrEqual(
        MIN_TEXT_CONTRAST,
      );
    });
  });
});
