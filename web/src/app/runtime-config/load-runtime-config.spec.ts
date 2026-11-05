import { loadRuntimeConfig } from './load-runtime-config';

const respondWith = (body: string, status = 200): typeof fetch =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status }));

describe('loadRuntimeConfig', () => {
  it('fetches config.json uncached and parses it', async () => {
    const fetchFn = respondWith('{ "apiBaseUrl": "/api" }');

    await expect(loadRuntimeConfig(fetchFn)).resolves.toEqual({ apiBaseUrl: '/api' });
    expect(fetchFn).toHaveBeenCalledWith('config.json', { cache: 'no-store' });
  });

  it('rejects with the status when the file cannot be fetched', async () => {
    await expect(loadRuntimeConfig(respondWith('Not found', 404))).rejects.toThrow(/HTTP 404/);
  });

  it('rejects when the file is invalid', async () => {
    await expect(loadRuntimeConfig(respondWith('{ "apiBaseUrl": 1 }'))).rejects.toThrow(
      /apiBaseUrl/,
    );
  });
});
