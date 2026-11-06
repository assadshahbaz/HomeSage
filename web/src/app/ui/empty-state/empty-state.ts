import { Component, input } from '@angular/core';

import { EMPTY_STATE_CLASSES } from './empty-state-classes';

/**
 * What a list shows instead of a blank area: a heading, an optional
 * description and an optional action projected as content.
 */
@Component({
  selector: 'hs-empty-state',
  templateUrl: './empty-state.html',
})
export class EmptyState {
  public readonly heading = input.required<string>();
  public readonly description = input<string>();

  protected readonly classes = EMPTY_STATE_CLASSES;
}
