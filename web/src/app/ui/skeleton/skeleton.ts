import { Component, computed, input } from '@angular/core';

import type { SkeletonShape } from './skeleton-classes';
import { SKELETON_CLASSES } from './skeleton-classes';

/**
 * A placeholder in roughly the shape of content that is on its way, such as a
 * property card while retrieval runs. Hidden from screen readers: the
 * surrounding region announces the busy state.
 */
@Component({
  selector: 'hs-skeleton',
  templateUrl: './skeleton.html',
  host: { 'aria-hidden': 'true' },
})
export class Skeleton {
  public readonly shape = input<SkeletonShape>('line');

  protected readonly classes = computed(() =>
    [SKELETON_CLASSES.root, SKELETON_CLASSES.shape[this.shape()]].join(' '),
  );
}
