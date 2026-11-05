import { Component, computed, input, output } from '@angular/core';

import { CARD_CLASSES } from './card-classes';

/**
 * The container for property cards and summary tiles, with optional
 * `[hsCardHeader]` and `[hsCardFooter]` slots. A clickable card turns its
 * heading into its one button, so it needs a heading; other controls inside
 * the card keep their own clicks. `highlighted` marks the card a reader was
 * just sent to, such as the one a citation points at.
 */
@Component({
  selector: 'hs-card',
  templateUrl: './card.html',
})
export class Card {
  public readonly heading = input<string>();
  public readonly clickable = input(false);
  public readonly highlighted = input(false);

  public readonly activated = output();

  protected readonly classes = CARD_CLASSES;
  protected readonly hasAction = computed(() => this.clickable() && Boolean(this.heading()));
  protected readonly rootClasses = computed(() =>
    [
      CARD_CLASSES.root,
      this.highlighted() ? CARD_CLASSES.border.highlighted : CARD_CLASSES.border.normal,
      this.hasAction() ? CARD_CLASSES.clickableRoot : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  protected readonly slotClasses = computed(() =>
    this.hasAction() ? `${CARD_CLASSES.slot} ${CARD_CLASSES.clickableSlot}` : CARD_CLASSES.slot,
  );

  protected activate(): void {
    this.activated.emit();
  }
}
