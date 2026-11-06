import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';

import { Skeleton } from './skeleton';
import type { SkeletonShape } from './skeleton-classes';
import { SKELETON_CLASSES } from './skeleton-classes';

@Component({
  imports: [Skeleton],
  template: `<hs-skeleton [shape]="shape()" />`,
})
class Host {
  public readonly shape = signal<SkeletonShape>('line');
}

describe('Skeleton', () => {
  let fixture: ComponentFixture<Host>;
  const skeleton = (): HTMLElement =>
    (fixture.nativeElement as HTMLElement).querySelector('hs-skeleton')!;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
  });

  it('is hidden from assistive technology', () => {
    expect(skeleton().getAttribute('aria-hidden')).toBe('true');
  });

  it('animates only behind motion-safe', () => {
    const classes = [skeleton(), ...skeleton().querySelectorAll('*')].flatMap((node) => [
      ...node.classList,
    ]);
    const animations = classes.filter((name) => /(^|:)animate-/.test(name));

    expect(animations).toContain('motion-safe:animate-pulse');
    expect(animations.filter((name) => !name.startsWith('motion-safe:'))).toEqual([]);
  });

  it('gives each shape a distinct class string', async () => {
    const seen = new Set<string>();
    for (const shape of Object.keys(SKELETON_CLASSES.shape) as SkeletonShape[]) {
      fixture.componentInstance.shape.set(shape);
      await fixture.whenStable();
      seen.add(skeleton().querySelector('span')!.className);
    }
    expect(seen.size).toBe(Object.keys(SKELETON_CLASSES.shape).length);
  });
});
