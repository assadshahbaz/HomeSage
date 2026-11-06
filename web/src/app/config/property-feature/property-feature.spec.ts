import { aPropertySummary } from '../../property/property-summary.fixture';
import { PROPERTY_FEATURES, statedFeatures } from './property-feature';

describe('statedFeatures', () => {
  it('returns nothing when the listing states no feature', () => {
    expect(statedFeatures(aPropertySummary())).toEqual([]);
  });

  it('returns only the stated features, in display order', () => {
    const summary = aPropertySummary({ isNewBuild: true, hasGarden: true, hasGarage: true });

    expect(statedFeatures(summary).map((feature) => feature.label)).toEqual([
      'Garden',
      'Garage',
      'New build',
    ]);
  });

  it('has a label for every feature flag, each once', () => {
    const keys = PROPERTY_FEATURES.map((feature) => feature.key);
    const everyFlagTrue = aPropertySummary(Object.fromEntries(keys.map((key) => [key, true])));

    expect(new Set(keys).size).toBe(keys.length);
    expect(statedFeatures(everyFlagTrue)).toHaveLength(keys.length);
    expect(
      Object.entries(aPropertySummary())
        .filter(([, value]) => typeof value === 'boolean')
        .map(([key]) => key)
        .sort(),
    ).toEqual([...keys].sort());
  });
});
