import { Component, computed, input } from '@angular/core';

import type { ControlSize } from '../theme/size';
import { SPINNER_CLASSES } from './spinner-classes';

/**
 * "Something is happening" in a tight space, such as a send button. Hidden from
 * screen readers: the surrounding region announces the busy state.
 */
@Component({
  selector: 'hs-spinner',
  templateUrl: './spinner.html',
  host: { 'aria-hidden': 'true' },
})
export class Spinner {
  public readonly size = input<ControlSize>('md');

  protected readonly parts = SPINNER_CLASSES;
  protected readonly classes = computed(() =>
    [SPINNER_CLASSES.root, SPINNER_CLASSES.size[this.size()]].join(' '),
  );
}
