import { Component, computed, input } from '@angular/core';

import type { ControlSize } from '../theme/size';
import type { ButtonVariant } from './button-classes';
import { BUTTON_CLASSES } from './button-classes';

/** `submit` only inside a form; everything else is a plain `button`. */
export type ButtonType = 'button' | 'submit';

/** Any clickable action. Listen with `(click)` on `hs-button`; a disabled button never emits one. */
@Component({
  selector: 'hs-button',
  templateUrl: './button.html',
})
export class Button {
  public readonly variant = input<ButtonVariant>('secondary');
  public readonly size = input<ControlSize>('md');
  public readonly type = input<ButtonType>('button');
  public readonly disabled = input(false);
  /** Accessible name, required when the content is only an icon. */
  public readonly label = input<string>();
  /** Set for a toggle button; leave unset for a plain action. */
  public readonly pressed = input<boolean>();

  protected readonly classes = computed(() =>
    [
      BUTTON_CLASSES.root,
      BUTTON_CLASSES.variant[this.variant()],
      BUTTON_CLASSES.size[this.size()],
    ].join(' '),
  );
}
