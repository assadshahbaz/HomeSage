import type { ElementRef } from '@angular/core';
import { Component, effect, input, model, viewChild } from '@angular/core';

import { Button } from '../button/button';
import { uniqueId } from '../unique-id';
import { DRAWER_CLASSES } from './drawer-classes';

/**
 * A panel that slides over the page from the end edge, such as the under the
 * hood view. It is a native modal <dialog>, so the browser traps focus, closes
 * it on Escape and returns focus to the control that opened it.
 */
@Component({
  selector: 'hs-drawer',
  imports: [Button],
  templateUrl: './drawer.html',
  // A backdrop click is a pointer shortcut; Escape is the keyboard way to close.
  host: { '(click)': 'closeFromBackdrop($event)' },
})
export class Drawer {
  public readonly heading = input.required<string>();
  public readonly open = model(false);

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly classes = DRAWER_CLASSES;
  protected readonly headingId = uniqueId('drawer-heading');

  public constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;
      // The attribute, not the `open` property, so a stubbed dialog behaves the same.
      const isOpen = dialog.hasAttribute('open');
      if (this.open() && !isOpen) {
        dialog.showModal();
      } else if (!this.open() && isOpen) {
        dialog.close();
      }
    });
  }

  // Also bound to the dialog's own close event, which Escape fires.
  protected close(): void {
    this.open.set(false);
  }

  protected closeFromBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.open.set(false);
    }
  }
}
