import { describe, it, expect, vi, afterEach } from 'vitest';
import { requestPersistentStorage } from './persistStorage';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestPersistentStorage', () => {
  it('calls navigator.storage.persist() and returns its result', async () => {
    const persist = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis.navigator, 'storage', {
      value: { persist },
      configurable: true,
    });

    const result = await requestPersistentStorage();

    expect(persist).toHaveBeenCalledOnce();
    expect(result).toBe(true);
  });

  it('returns false when the Storage API is unavailable (no crash)', async () => {
    Object.defineProperty(globalThis.navigator, 'storage', {
      value: undefined,
      configurable: true,
    });

    const result = await requestPersistentStorage();

    expect(result).toBe(false);
  });
});
