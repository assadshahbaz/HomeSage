import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import type { ControlSize } from '../theme/size';
import { Chip } from './chip';
import { CHIP_CLASSES } from './chip-classes';

@Component({
  imports: [Chip],
  template: `<hs-chip [size]="size()">Under £250,000</hs-chip>`,
})
class Host {
  public readonly size = signal<ControlSize>('md');
}

describe('Chip', () => {
  let fixture: ComponentFixture<Host>;
  const label = (): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector('hs-chip > span')!;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('shows its projected text and is not a control', () => {
    expect(label().textContent.trim()).toBe('Under £250,000');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('button, a, [tabindex]'),
    ).toBeNull();
  });

  it('gives each size a distinct class string', async () => {
    const seen = new Set<string>();
    for (const size of Object.keys(CHIP_CLASSES.size) as ControlSize[]) {
      fixture.componentInstance.size.set(size);
      await fixture.whenStable();
      seen.add(label().className);
    }
    expect(seen.size).toBe(Object.keys(CHIP_CLASSES.size).length);
  });
});
