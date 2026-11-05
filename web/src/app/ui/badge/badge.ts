import { Component, computed, input } from '@angular/core';

import type { ControlSize } from '../theme/size';
import type { BadgeTone } from './badge-classes';
import { BADGE_CLASSES } from './badge-classes';

/** A short inline label for a fact or a status, such as a council tax band. */
@Component({
  selector: 'hs-badge',
  templateUrl: './badge.html',
})
export class Badge {
  public readonly tone = input<BadgeTone>('neutral');
  public readonly size = input<ControlSize>('sm');

  protected readonly classes = computed(() =>
    [BADGE_CLASSES.root, BADGE_CLASSES.tone[this.tone()], BADGE_CLASSES.size[this.size()]].join(
      ' ',
    ),
  );
}
