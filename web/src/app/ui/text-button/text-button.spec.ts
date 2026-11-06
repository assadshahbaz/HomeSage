import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { FOCUS_RING } from '../theme/fragments';
import { TextButton } from './text-button';

@Component({
  imports: [TextButton],
  template: `
    <p>
      A garden
      <hs-text-button [label]="label()" (click)="clicks = clicks + 1">P-1207</hs-text-button>.
    </p>
  `,
})
class Host {
  public readonly label = signal<string | undefined>(undefined);
  public clicks = 0;
}

describe('TextButton', () => {
  let fixture: ComponentFixture<Host>;
  let button: HTMLButtonElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  });

  it('renders its content inside a native button of type button, inline in the text', () => {
    expect(button.type).toBe('button');
    expect(button.textContent.trim()).toBe('P-1207');
    expect(button.closest('p')).not.toBeNull();
  });

  it('emits a click', () => {
    button.click();

    expect(fixture.componentInstance.clicks).toBe(1);
  });

  it('shows a focus ring for keyboard focus', () => {
    for (const part of FOCUS_RING.split(' ')) {
      expect(button.classList).toContain(part);
    }
  });

  it('takes an accessible name only when one is given', async () => {
    expect(button.hasAttribute('aria-label')).toBe(false);

    fixture.componentInstance.label.set('Show property P-1207');
    await fixture.whenStable();

    expect(button.getAttribute('aria-label')).toBe('Show property P-1207');
  });
});
