import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import type { ControlSize } from '../theme/size';
import { Spinner } from './spinner';
import { SPINNER_CLASSES } from './spinner-classes';

@Component({
  imports: [Spinner],
  template: `<hs-spinner [size]="size()" />`,
})
class Host {
  public readonly size = signal<ControlSize>('md');
}

describe('Spinner', () => {
  let fixture: ComponentFixture<Host>;
  const spinner = (): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector('hs-spinner')!;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('is hidden from assistive technology', () => {
    expect(spinner().getAttribute('aria-hidden')).toBe('true');
  });

  it('animates only behind motion-safe', () => {
    const classes = [spinner(), ...spinner().querySelectorAll('*')].flatMap((node) => [
      ...node.classList,
    ]);
    const animations = classes.filter((name) => /(^|:)animate-/.test(name));

    expect(animations).toContain('motion-safe:animate-spin');
    expect(animations.filter((name) => !name.startsWith('motion-safe:'))).toEqual([]);
  });

  it('gives each size a distinct class string', async () => {
    const seen = new Set<string>();
    for (const size of Object.keys(SPINNER_CLASSES.size) as ControlSize[]) {
      fixture.componentInstance.size.set(size);
      await fixture.whenStable();
      seen.add(spinner().querySelector('svg')!.getAttribute('class')!);
    }
    expect(seen.size).toBe(Object.keys(SPINNER_CLASSES.size).length);
  });
});
