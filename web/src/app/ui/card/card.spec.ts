import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { Card } from './card';

@Component({
  imports: [Card],
  template: `
    <hs-card
      [heading]="heading()"
      [clickable]="clickable()"
      [highlighted]="highlighted()"
      (activated)="activations = activations + 1"
    >
      <span hsCardHeader>£245,000</span>
      <p>3 bedrooms, 2 bathrooms</p>
      @if (withControl()) {
        <button type="button" (click)="saves = saves + 1">Save</button>
      }
      <p hsCardFooter>Listing data from 13 April 2025</p>
    </hs-card>
  `,
})
class Host {
  public readonly heading = signal<string | undefined>('20 Larkfield Rise, Aberdeen');
  public readonly clickable = signal(false);
  public readonly withControl = signal(false);
  public readonly highlighted = signal(false);
  public activations = 0;
  public saves = 0;
}

describe('Card', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;

  const render = async (): Promise<void> => {
    await fixture.whenStable();
  };
  const buttons = (): HTMLButtonElement[] => [...host.querySelectorAll('button')];
  const byText = (text: string): HTMLButtonElement =>
    buttons().find((button) => button.textContent.trim() === text)!;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement as HTMLElement;
    await render();
  });

  it('renders the heading, the header slot, the body and the footer slot in order', () => {
    const blocks = [...host.querySelectorAll('article h3, article span, article p')].map((node) =>
      node.textContent.trim(),
    );

    expect(blocks).toEqual([
      '20 Larkfield Rise, Aberdeen',
      '£245,000',
      '3 bedrooms, 2 bathrooms',
      'Listing data from 13 April 2025',
    ]);
  });

  it('has no button when it is not clickable', () => {
    expect(buttons()).toEqual([]);
  });

  it('turns its heading into one button that emits activated', async () => {
    fixture.componentInstance.clickable.set(true);
    await render();

    expect(buttons().map((button) => button.textContent.trim())).toEqual([
      '20 Larkfield Rise, Aberdeen',
    ]);

    byText('20 Larkfield Rise, Aberdeen').click();

    expect(fixture.componentInstance.activations).toBe(1);
  });

  it('lets a control inside the card take its own click without activating the card', async () => {
    fixture.componentInstance.clickable.set(true);
    fixture.componentInstance.withControl.set(true);
    await render();

    byText('Save').click();

    expect(fixture.componentInstance.saves).toBe(1);
    expect(fixture.componentInstance.activations).toBe(0);
  });

  it('is not clickable without a heading to name its button', async () => {
    fixture.componentInstance.clickable.set(true);
    fixture.componentInstance.heading.set(undefined);
    await render();

    expect(buttons()).toEqual([]);
    expect(host.querySelector('h3')).toBeNull();
  });

  it('looks different when highlighted, and returns to normal after', async () => {
    // Sorted, because Angular may put a class back in a different position.
    const classes = (): string => [...host.querySelector('article')!.classList].sort().join(' ');
    const normal = classes();

    fixture.componentInstance.highlighted.set(true);
    await render();
    const highlighted = classes();

    fixture.componentInstance.highlighted.set(false);
    await render();

    expect(highlighted).not.toBe(normal);
    expect(classes()).toBe(normal);
  });
});
