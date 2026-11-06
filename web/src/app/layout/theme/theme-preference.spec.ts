import { TestBed } from '@angular/core/testing';

import { THEME, ThemePreference } from './theme-preference';

const STORAGE_KEY = 'hs-theme';

/** A controllable stand in for `matchMedia('(prefers-color-scheme: dark)')`. */
function fakeSystemTheme(dark: boolean): { change: (dark: boolean) => void } {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const query = {
    matches: dark,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    change: (next) => {
      query.matches = next;
      listeners.forEach((listener) => {
        listener({ matches: next } as MediaQueryListEvent);
      });
    },
  };
}

function create(): ThemePreference {
  const preference = TestBed.inject(ThemePreference);
  TestBed.tick();
  return preference;
}

const appliedTheme = (): string | undefined => document.documentElement.dataset['theme'];

describe('ThemePreference', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset['theme'];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('follows a dark system preference when nothing is stored', () => {
    fakeSystemTheme(true);

    expect(create().theme()).toBe(THEME.DARK);
    expect(appliedTheme()).toBe(THEME.DARK);
  });

  it('follows the system when it changes while the page is open', () => {
    const system = fakeSystemTheme(false);
    const preference = create();

    system.change(true);
    TestBed.tick();

    expect(preference.theme()).toBe(THEME.DARK);
    expect(appliedTheme()).toBe(THEME.DARK);
  });

  it('prefers a stored choice over the system', () => {
    fakeSystemTheme(false);
    localStorage.setItem(STORAGE_KEY, THEME.DARK);

    expect(create().theme()).toBe(THEME.DARK);
  });

  it('keeps a stored choice when the system changes', () => {
    const system = fakeSystemTheme(false);
    localStorage.setItem(STORAGE_KEY, THEME.LIGHT);
    const preference = create();

    system.change(true);

    expect(preference.theme()).toBe(THEME.LIGHT);
  });

  it('ignores a stored value that is not a theme', () => {
    fakeSystemTheme(true);
    localStorage.setItem(STORAGE_KEY, 'purple');

    expect(create().theme()).toBe(THEME.DARK);
  });

  it('falls back to light when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);

    expect(create().theme()).toBe(THEME.LIGHT);
  });

  it('toggles, applies and remembers the choice', () => {
    fakeSystemTheme(false);
    const preference = create();

    preference.toggle();
    TestBed.tick();

    expect(preference.theme()).toBe(THEME.DARK);
    expect(appliedTheme()).toBe(THEME.DARK);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(THEME.DARK);
  });

  it('still toggles when storage throws on read and write', () => {
    fakeSystemTheme(false);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const preference = create();

    preference.toggle();
    TestBed.tick();

    expect(preference.theme()).toBe(THEME.DARK);
    expect(appliedTheme()).toBe(THEME.DARK);
  });
});
