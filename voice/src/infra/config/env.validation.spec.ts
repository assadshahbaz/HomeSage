import { toAppConfig } from './app-config.js';
import { validateEnv } from './env.validation.js';

const SECRET = 'a'.repeat(24);
const REQUIRED = {
  HOMESAGE_URL: 'http://127.0.0.1:3000/',
  VOICE_WEBHOOK_SECRET: SECRET,
  ADMIN_TOKEN: SECRET,
};

describe('validateEnv', () => {
  it('fills every default', () => {
    const config = toAppConfig(validateEnv(REQUIRED));
    expect(config.port).toBe(3100);
    expect(config.homesage.url).toBe('http://127.0.0.1:3000');
    expect(config.viewings.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(config.agency).toEqual({ name: 'HomeSage Estates', timeZone: 'Europe/London' });
    expect(config.notify.webhookUrl).toBeNull();
    expect(config.callMemoryTtlMs).toBe(120 * 60_000);
  });

  it('reads viewing days and treats a blank webhook as unset', () => {
    const env = validateEnv({ ...REQUIRED, VIEWING_DAYS: '6, 0', NOTIFY_WEBHOOK_URL: '' });
    expect(env.VIEWING_DAYS).toEqual([6, 0]);
    expect(env.NOTIFY_WEBHOOK_URL).toBeUndefined();
  });

  it('names every variable at fault', () => {
    expect(() =>
      validateEnv({
        HOMESAGE_URL: 'not a url',
        VOICE_WEBHOOK_SECRET: 'short',
        ADMIN_TOKEN: SECRET,
        AGENCY_TIMEZONE: 'Mars/Olympus',
        VIEWING_DAYS: '1,9',
      }),
    ).toThrow(/HOMESAGE_URL[\s\S]*VOICE_WEBHOOK_SECRET[\s\S]*AGENCY_TIMEZONE[\s\S]*VIEWING_DAYS/);
  });

  it('refuses viewing hours that end before they start', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, VIEWING_START: '17:00', VIEWING_END: '10:00' }),
    ).toThrow(/VIEWING_START/);
  });
});
