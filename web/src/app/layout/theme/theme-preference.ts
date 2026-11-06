import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';

export const THEME = {
  LIGHT: 'light',
  DARK: 'dark',
} as const;

export type Theme = (typeof THEME)[keyof typeof THEME];

// The inline script in index.html reads the same key before Angular boots.
const STORAGE_KEY = 'hs-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

const isTheme = (value: unknown): value is Theme => value === THEME.LIGHT || value === THEME.DARK;

/**
 * The effective colour theme. An explicit choice is remembered; with none, the
 * system preference is followed, including when it changes. Storage may be
 * blocked, in which case the choice lasts for this visit only.
 */
@Injectable({ providedIn: 'root' })
export class ThemePreference {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly chosen = signal<Theme | null>(this.readStored());
  private readonly systemDark = signal(false);

  public readonly theme = computed<Theme>(
    () => this.chosen() ?? (this.systemDark() ? THEME.DARK : THEME.LIGHT),
  );

  public constructor() {
    this.followSystem();
    effect(() => {
      this.document.documentElement.dataset['theme'] = this.theme();
    });
  }

  /** Switches to the other theme and remembers the choice. */
  public toggle(): void {
    const next = this.theme() === THEME.DARK ? THEME.LIGHT : THEME.DARK;
    this.chosen.set(next);
    try {
      this.window?.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Blocked storage: the choice still applies until the page is closed.
    }
  }

  private followSystem(): void {
    // Not every environment implements matchMedia (jsdom, some embedded views),
    // whatever the DOM types say.
    if (!this.window || typeof (this.window as Partial<Window>).matchMedia !== 'function') {
      return;
    }
    const query = this.window.matchMedia(DARK_QUERY);
    this.systemDark.set(query.matches);
    const onChange = (event: MediaQueryListEvent): void => {
      this.systemDark.set(event.matches);
    };
    query.addEventListener('change', onChange);
    inject(DestroyRef).onDestroy(() => {
      query.removeEventListener('change', onChange);
    });
  }

  private readStored(): Theme | null {
    try {
      const stored = this.window?.localStorage.getItem(STORAGE_KEY);
      return isTheme(stored) ? stored : null;
    } catch {
      return null;
    }
  }
}
