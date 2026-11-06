import { containsPersonalData, looksLikePhoneNumber } from './personal-data.ts';

describe('personal data', () => {
  it('spots phone numbers', () => {
    expect(looksLikePhoneNumber('07700900123')).toBe(true);
    expect(looksLikePhoneNumber('01632 960123')).toBe(true);
    expect(looksLikePhoneNumber('BT')).toBe(false);
  });

  it('spots text about people', () => {
    expect(containsPersonalData('I am the executor of my aunt’s estate')).toBe(true);
    expect(containsPersonalData('Mrs Allan owned it from 1998')).toBe(true);
    expect(containsPersonalData('ask me at owner@example.com')).toBe(true);
    expect(containsPersonalData('Roof repaired after storm damage in 2023')).toBe(false);
  });
});
