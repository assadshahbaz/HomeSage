import { callerPhone } from './caller-phone.js';

describe('callerPhone', () => {
  const withCallerId = { callId: 'call-1', callerNumber: '+441632960123' };
  const withoutCallerId = { callId: 'call-1', callerNumber: null };

  it('prefers the number the caller gave, tidied up', () => {
    expect(callerPhone('07700 900-123', withCallerId)).toBe('07700900123');
    expect(callerPhone('+44 (0)7700 900123', withCallerId)).toBe('+4407700900123');
  });

  it('falls back to caller ID', () => {
    expect(callerPhone(undefined, withCallerId)).toBe('+441632960123');
  });

  it('is null when there is no number at all', () => {
    expect(callerPhone(undefined, withoutCallerId)).toBeNull();
    expect(callerPhone('none', withoutCallerId)).toBeNull();
  });

  it('keeps only a leading plus', () => {
    expect(callerPhone('0+7700+900', withoutCallerId)).toBe('07700900');
  });
});
