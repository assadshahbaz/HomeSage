import { Component, computed, input } from '@angular/core';

import type { ControlSize } from '../theme/size';
import { CHIP_CLASSES } from './chip-classes';

/** A rounded label for a filter value, such as "Under £250,000". Display only. */
@Component({
  selector: 'hs-chip',
  templateUrl: './chip.html',
})
export class Chip {
  public readonly size = input<ControlSize>('md');

  protected readonly classes = computed(() =>
    [CHIP_CLASSES.root, CHIP_CLASSES.size[this.size()]].join(' '),
  );
}
