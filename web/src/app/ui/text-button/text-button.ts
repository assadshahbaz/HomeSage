import { Component, input } from '@angular/core';

import { TEXT_BUTTON_CLASSES } from './text-button-classes';

/**
 * An action that reads as part of running text, such as a reference inside a
 * paragraph. Listen with `(click)` on `hs-text-button`; Enter and Space come
 * from the native button.
 */
@Component({
  selector: 'hs-text-button',
  templateUrl: './text-button.html',
})
export class TextButton {
  /** Accessible name, when the visible text alone would not say what it does. */
  public readonly label = input<string>();

  protected readonly classes = TEXT_BUTTON_CLASSES;
}
