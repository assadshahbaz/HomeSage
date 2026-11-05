import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import type { ControlSize } from '../theme/size';
import { Badge } from './badge';
import type { BadgeTone } from './badge-classes';
import { BADGE_CLASSES } from './badge-classes';

@Component({
  imports: [Badge],
  template: `<hs-badge [tone]="tone()" [size]="size()">Band E</hs-badge>`,
})
class Host {
  public readonly tone = signal<BadgeTone>('neutral');
  public readonly size = signal<ControlSize>('sm');
}

describe('Badge', () => {
  let fixture: ComponentFixture<Host>;
  const label = (): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector('hs-badge > span')!;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('shows its projected text', () => {
    expect(label().textContent.trim()).toBe('Band E');
  });

  it('gives each tone a distinct class string', async () => {
    const seen = new Set<string>();
    for (const tone of Object.keys(BADGE_CLASSES.tone) as BadgeTone[]) {
      fixture.componentInstance.tone.set(tone);
      await fixture.whenStable();
      seen.add(label().className);
    }
    expect(seen.size).toBe(Object.keys(BADGE_CLASSES.tone).length);
  });

  it('gives each size a distinct class string', async () => {
    const seen = new Set<string>();
    for (const size of Object.keys(BADGE_CLASSES.size) as ControlSize[]) {
      fixture.componentInstance.size.set(size);
      await fixture.whenStable();
      seen.add(label().className);
    }
    expect(seen.size).toBe(Object.keys(BADGE_CLASSES.size).length);
  });
});
