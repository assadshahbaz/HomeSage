import type { PropertySummary } from '@api/contracts';

/** A realistic summary for specs, with every feature flag false unless overridden. */
export function aPropertySummary(overrides: Partial<PropertySummary> = {}): PropertySummary {
  return {
    id: '3501',
    address: '20 Larkfield Rise Eastholm, Aberdeen, AB21 9CK',
    price: 229_000,
    bedrooms: 3,
    bathrooms: 2,
    publicRooms: 1,
    areaM2: 97,
    town: 'Aberdeen',
    postcodeDistrict: 'AB21',
    councilTaxBand: 'E',
    heatingType: 'gas',
    hasGarden: false,
    hasGarage: false,
    hasDoubleGarage: false,
    hasOffStreetParking: false,
    hasLand: false,
    hasGroundFloorBedroomBathroom: false,
    hasGrannyFlat: false,
    hasGreenEnergy: false,
    hasElectricVehicleChargePoint: false,
    isNewBuild: false,
    ...overrides,
  };
}
