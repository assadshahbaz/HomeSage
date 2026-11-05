import { DOCUMENT } from '@angular/common';
import { Component, computed, ElementRef, inject, input, linkedSignal } from '@angular/core';
import type { PropertySummary } from '@api/contracts';

import { Card } from '../../ui/card/card';
import { EmptyState } from '../../ui/empty-state/empty-state';
import { Skeleton } from '../../ui/skeleton/skeleton';
import { citedProperties } from '../cited-properties';
import { PropertyCard, propertyCardId } from '../property-card/property-card';

/** Placeholder cards shown while retrieval runs, roughly a first screen's worth. */
const SKELETON_CARD_COUNT = 3;
const SKELETON_CARDS = Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => index);
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * The cards for the properties an answer cited, in citation order, with
 * skeletons while retrieval runs and an empty state when nothing was cited.
 * A citation calls `showCard` to send the reader to its card.
 */
@Component({
  selector: 'hs-property-card-list',
  imports: [Card, EmptyState, PropertyCard, Skeleton],
  templateUrl: './property-card-list.html',
})
export class PropertyCardList {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly window = inject(DOCUMENT).defaultView;

  public readonly citedIds = input<readonly string[]>([]);
  public readonly properties = input<readonly PropertySummary[]>([]);
  public readonly loading = input(false);

  protected readonly skeletons = SKELETON_CARDS;
  protected readonly cards = computed(() => citedProperties(this.citedIds(), this.properties()));
  protected readonly isEmpty = computed(() => this.cards().length === 0);
  // Cleared whenever the cards change, so a new answer starts with none highlighted.
  protected readonly highlightedId = linkedSignal<readonly PropertySummary[], string | null>({
    source: this.cards,
    computation: () => null,
  });

  /**
   * Scrolls to a card, highlights it and moves focus to it. An id with no card
   * on screen does nothing, so a stray citation can never break the page.
   */
  public showCard(propertyId: string): void {
    // Compared, not put in a selector: the id comes from answer text and may be malformed.
    const cardId = propertyCardId(propertyId);
    const card = [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>('hs-property-card'),
    ].find((element) => element.id === cardId);
    if (!card) {
      return;
    }
    this.highlightedId.set(propertyId);
    card.scrollIntoView({
      behavior: this.prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'nearest',
    });
    card.focus({ preventScroll: true });
  }

  private prefersReducedMotion(): boolean {
    // Not every environment implements matchMedia, whatever the DOM types say.
    if (!this.window || typeof (this.window as Partial<Window>).matchMedia !== 'function') {
      return false;
    }
    return this.window.matchMedia(REDUCED_MOTION_QUERY).matches;
  }
}
