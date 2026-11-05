import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { ThemeToggle } from './theme-toggle';

describe('ThemeToggle', () => {
  let fixture: ComponentFixture<ThemeToggle>;
  let button: HTMLButtonElement;

  beforeEach(async () => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    fixture = TestBed.createComponent(ThemeToggle);
    await fixture.whenStable();
    button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a toggle button named for the dark theme, off in a light system', () => {
    expect(button.getAttribute('aria-label')).toBe('Dark theme');
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('turns the dark theme on and off', async () => {
    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    button.click();
    await fixture.whenStable();

    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
