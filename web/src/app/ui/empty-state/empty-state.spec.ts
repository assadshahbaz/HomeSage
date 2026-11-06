import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <hs-empty-state heading="No properties match" [description]="description()">
      @if (withAction()) {
        <a href="/">Start again</a>
      }
    </hs-empty-state>
  `,
})
class Host {
  public readonly description = signal<string | undefined>('Try a higher price or fewer filters.');
  public readonly withAction = signal(true);
}

describe('EmptyState', () => {
  let fixture: ComponentFixture<Host>;
  let host: HTMLElement;

  const texts = (): string[] =>
    [...host.querySelectorAll('p, a')].map((node) => node.textContent.trim());

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.nativeElement as HTMLElement;
    await fixture.whenStable();
  });

  it('shows the heading, the description and the action', () => {
    expect(texts()).toEqual([
      'No properties match',
      'Try a higher price or fewer filters.',
      'Start again',
    ]);
  });

  it('leaves out the description when there is none, with no empty paragraph', async () => {
    fixture.componentInstance.description.set(undefined);
    await fixture.whenStable();

    expect(texts()).toEqual(['No properties match', 'Start again']);
  });

  it('renders no action when none is projected', async () => {
    fixture.componentInstance.withAction.set(false);
    await fixture.whenStable();

    expect(host.querySelector('a')).toBeNull();
    expect(texts()).toEqual(['No properties match', 'Try a higher price or fewer filters.']);
  });
});
