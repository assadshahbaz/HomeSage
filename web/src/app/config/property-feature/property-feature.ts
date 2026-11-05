import type { PropertySummary } from '@api/contracts';

/** A feature flag on a property summary. */
export type PropertyFeatureKey = keyof {
  [K in keyof PropertySummary as PropertySummary[K] extends boolean ? K : never]: true;
};

/** One feature a card can show, and how it is written. */
export interface PropertyFeature {
  key: PropertyFeatureKey;
  label: string;
}

/** Every feature flag, in the order a card lists them. */
export const PROPERTY_FEATURES: readonly PropertyFeature[] = [
  { key: 'hasGarden', label: 'Garden' },
  { key: 'hasLand', label: 'Land' },
  { key: 'hasGarage', label: 'Garage' },
  { key: 'hasDoubleGarage', label: 'Double garage' },
  { key: 'hasOffStreetParking', label: 'Off street parking' },
  { key: 'hasElectricVehicleChargePoint', label: 'EV charge point' },
  { key: 'hasGroundFloorBedroomBathroom', label: 'Ground floor bedroom and bathroom' },
  { key: 'hasGrannyFlat', label: 'Granny flat' },
  { key: 'hasGreenEnergy', label: 'Green energy' },
  { key: 'isNewBuild', label: 'New build' },
];

/**
 * The features the listing states, in display order. A false flag means the
 * listing did not mention it, so it is left out rather than shown as "no".
 */
export function statedFeatures(summary: PropertySummary): PropertyFeature[] {
  return PROPERTY_FEATURES.filter((feature) => summary[feature.key]);
}
