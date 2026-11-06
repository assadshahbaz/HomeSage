import { disclosureAnswer, heatingType, ownershipMonths, supplierName } from './answers.ts';

describe('disclosureAnswer', () => {
  it('reads the plain answers whatever the casing', () => {
    expect(disclosureAnswer('Yes')).toEqual({ value: 'yes', detail: null });
    expect(disclosureAnswer('NO')).toEqual({ value: 'no', detail: null });
    expect(disclosureAnswer('no')).toEqual({ value: 'no', detail: null });
  });

  it('keeps unknown separate from no', () => {
    for (const value of [
      "Don't know",
      'Dont Know',
      'Don’t Know',
      'Not sure',
      'unknown',
      null,
      '',
    ]) {
      expect(disclosureAnswer(value).value).toBe('unknown');
    }
    expect(disclosureAnswer('N/A').value).toBe('not_applicable');
  });

  it('keeps the sentence when the answer says more than yes or no', () => {
    const answer = disclosureAnswer(
      'Yes, new units fitted in January 2021 under a ten year warranty',
    );
    expect(answer.value).toBe('yes');
    expect(answer.detail).toContain('January 2021');

    const negative = disclosureAnswer('No, that paperwork is now 10 years old');
    expect(negative.value).toBe('no');
    expect(negative.detail).toContain('10 years old');
  });

  it('treats a supplier name as connected only where that question was asked', () => {
    expect(disclosureAnswer('Example Energy', { nameImpliesYes: true }).value).toBe('yes');
    expect(disclosureAnswer('Perhaps some in the shed roof, never tested.').value).toBe('unknown');
  });
});

describe('heatingType', () => {
  it('buckets the many spellings in the source', () => {
    for (const value of ['Gas', 'gas-fired', 'Gas Fired', 'GCH', 'gas central heating']) {
      expect(heatingType(value)).toBe('gas');
    }
    expect(heatingType('Oil')).toBe('oil');
    expect(heatingType('Electric storage heaters')).toBe('electric');
    expect(heatingType('Air source heat pump')).toBe('electric');
    expect(heatingType('None')).toBe('none');
    expect(heatingType('Solid fuel')).toBe('other');
    expect(heatingType('')).toBeNull();
  });
});

describe('ownershipMonths', () => {
  it('reads durations', () => {
    expect(ownershipMonths('10 years')).toBe(120);
    expect(ownershipMonths('2 years 6 months')).toBe(30);
    expect(ownershipMonths('9 months')).toBe(9);
  });

  it('refuses start dates, which are not durations', () => {
    expect(ownershipMonths('Since 1997')).toBeNull();
    expect(ownershipMonths('2022')).toBeNull();
    expect(ownershipMonths('Unknown')).toBeNull();
  });
});

describe('supplierName', () => {
  it('never returns a phone number as a supplier', () => {
    expect(supplierName('07700900456')).toBeNull();
    expect(supplierName('Example Energy')).toBe('Example Energy');
    expect(supplierName('No')).toBeNull();
  });
});
