import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { App } from '../../app';
import { routes } from '../../app.routes';
import { provideRuntimeConfig } from '../../runtime-config/runtime-config';

// Rendered through the root and the real routes, the way the shell is reached in the app.
describe('AppShell', () => {
  let fixture: ComponentFixture<App>;
  let host: HTMLElement;

  const navigate = async (url: string): Promise<void> => {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideRuntimeConfig({ apiBaseUrl: '/api' })],
    });
    fixture = TestBed.createComponent(App);
    host = fixture.nativeElement as HTMLElement;
    await navigate('/');
  });

  it('shows the header with the product name and the theme toggle', () => {
    const header = host.querySelector('header')!;

    expect(header.textContent).toContain('HomeSage');
    expect(header.querySelector('button[aria-label="Dark theme"]')).not.toBeNull();
  });

  it('renders the chat page inside the main region', () => {
    expect(host.querySelector('main h1')?.textContent).toContain('Ask about homes');
  });

  it('sends an unknown address to the chat page', async () => {
    await navigate('/no-such-page');

    expect(TestBed.inject(Router).url).toBe('/');
    expect(host.querySelector('main h1')).not.toBeNull();
  });

  it('moves focus to the main region from the skip link', () => {
    const skipLink = [...host.querySelectorAll('a')].find(
      (link) => link.textContent.trim() === 'Skip to content',
    )!;

    skipLink.click();

    expect(document.activeElement).toBe(host.querySelector('main'));
    expect(TestBed.inject(Router).url).toBe('/');
  });
});
