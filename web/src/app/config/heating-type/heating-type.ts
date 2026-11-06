import type { HeatingType } from '@api/contracts';

/**
 * How a card writes the heating the seller reported. `none` and `other` have
 * no label: neither says anything useful enough to show.
 */
const HEATING_LABELS: Partial<Record<HeatingType, string>> = {
  gas: 'Gas heating',
  oil: 'Oil heating',
  electric: 'Electric heating',
};

/** The label for a heating type, or null when there is nothing worth showing. */
export function heatingLabel(heatingType: HeatingType | null): string | null {
  return heatingType === null ? null : (HEATING_LABELS[heatingType] ?? null);
}
