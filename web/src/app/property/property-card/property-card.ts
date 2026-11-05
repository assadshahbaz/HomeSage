import { Component, computed, input } from '@angular/core';
import type { PropertySummary } from '@api/contracts';

import { heatingLabel } from '../../config/heating-type/heating-type';
import {
  describeCouncilTax,
  describePlace,
  describeSize,
} from '../../config/property-detail/property-detail';
import { statedFeatures } from '../../config/property-feature/property-feature';
import { formatPrice } from '../../format/price';
import { Badge } from '../../ui/badge/badge';
import { Card } from '../../ui/card/card';
import { Chip } from '../../ui/chip/chip';

/**
 * One cited property. It shows only what the listing states: a feature the
 * listing did not mention is left out, never shown as missing.
 */
@Component({
  selector: 'hs-property-card',
  imports: [Badge, Card, Chip],
  templateUrl: './property-card.html',
  host: {
    role: 'group',
    tabindex: '-1',
    class: 'block rounded-lg outline-none',
    '[id]': 'elementId()',
    '[attr.aria-label]': 'summary().address',
  },
})
export class PropertyCard {
  public readonly summary = input.required<PropertySummary>();
  public readonly highlighted = input(false);

  protected readonly elementId = computed(() => propertyCardId(this.summary().id));
  protected readonly price = computed(() => formatPrice(this.summary().price));
  protected readonly size = computed(() => describeSize(this.summary()));
  protected readonly place = computed(() => describePlace(this.summary()));
  protected readonly councilTax = computed(() => describeCouncilTax(this.summary()));
  protected readonly features = computed(() => {
    const heating = heatingLabel(this.summary().heatingType);
    const labels = statedFeatures(this.summary()).map((feature) => feature.label);
    return heating === null ? labels : [...labels, heating];
  });
  protected readonly hasDetails = computed(
    () => this.councilTax() !== null || this.features().length > 0,
  );
}

/** The DOM id of a property's card, so a citation can find it. */
export function propertyCardId(propertyId: string): string {
  return `property-${propertyId}`;
}
