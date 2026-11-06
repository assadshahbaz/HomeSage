import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import type { ControlSize } from '../theme/size';
import { Button } from './button';
import type { ButtonVariant } from './button-classes';
import { BUTTON_CLASSES } from './button-classes';

@Component({
  imports: [Button],
  template: `
    <hs-button
      [variant]="variant()"
      [size]="size()"
      [disabled]="disabled()"
      [label]="label()"
      [pressed]="pressed()"
      (click)="clicks = clicks + 1"
    >
      Send
    </hs-button>
  `,
})
class Host {
  public readonly variant = signal<ButtonVariant>('secondary');
  public readonly size = signal<ControlSize>('md');
  public readonly disabled = signal(false);
  public readonly label = signal<string | undefined>(undefined);
  public readonly pressed = signal<boolean | undefined>(undefined);
  public clicks = 0;
}

describe('Button', () => {
  let fixture: ComponentFixture<Host>;
  let button: HTMLButtonElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    button = (fixture.nativeElement as HTMLElement).querySelector('button')!;
  });

  const render = async (): Promise<void> => {
    await fixture.whenStable();
  };

  it('renders its content inside a native button of type button', () => {
    expect(button.textContent.trim()).toBe('Send');
    expect(button.type).toBe('button');
  });

  it('emits a click when enabled', () => {
    button.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });

  it('never emits a click when disabled', async () => {
    fixture.componentInstance.disabled.set(true);
    await render();

    button.click();

    expect(button.disabled).toBe(true);
    expect(fixture.componentInstance.clicks).toBe(0);
  });

  it('gives each variant a distinct class string', async () => {
    const seen = new Set<string>();
    for (const variant of Object.keys(BUTTON_CLASSES.variant) as ButtonVariant[]) {
      fixture.componentInstance.variant.set(variant);
      await render();
      seen.add(button.className);
    }
    expect(seen.size).toBe(Object.keys(BUTTON_CLASSES.variant).length);
  });

  it('gives each size a distinct class string', async () => {
    const seen = new Set<string>();
    for (const size of Object.keys(BUTTON_CLASSES.size) as ControlSize[]) {
      fixture.componentInstance.size.set(size);
      await render();
      seen.add(button.className);
    }
    expect(seen.size).toBe(Object.keys(BUTTON_CLASSES.size).length);
  });

  it('has no aria-label or aria-pressed unless asked for', () => {
    expect(button.hasAttribute('aria-label')).toBe(false);
    expect(button.hasAttribute('aria-pressed')).toBe(false);
  });

  it('exposes a label and a pressed state for icon toggles', async () => {
    fixture.componentInstance.label.set('Dark theme');
    fixture.componentInstance.pressed.set(false);
    await render();

    expect(button.getAttribute('aria-label')).toBe('Dark theme');
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fixture.componentInstance.pressed.set(true);
    await render();

    expect(button.getAttribute('aria-pressed')).toBe('true');
  });
});
