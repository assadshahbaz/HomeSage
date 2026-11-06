import { heatingLabel } from './heating-type';

describe('heatingLabel', () => {
  it.each([
    ['gas', 'Gas heating'],
    ['oil', 'Oil heating'],
    ['electric', 'Electric heating'],
  ] as const)('writes %s as %s', (heatingType, label) => {
    expect(heatingLabel(heatingType)).toBe(label);
  });

  it.each(['none', 'other', null] as const)('shows nothing for %s', (heatingType) => {
    expect(heatingLabel(heatingType)).toBeNull();
  });
});
