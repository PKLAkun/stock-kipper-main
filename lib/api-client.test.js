import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, ApiError } from './api-client.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('apiFetch', () => {
  it('mengembalikan data bila sukses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, a: 1 }) })));
    expect(await apiFetch('/x', { body: {} })).toEqual({ ok: true, a: 1 });
  });

  it('melempar ApiError dengan status server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'bentrok' }) })));
    await expect(apiFetch('/x')).rejects.toMatchObject({ name: 'ApiError', status: 409, message: 'bentrok' });
  });

  it('timeout membatalkan permintaan: ApiError status 0', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_u, opts) => new Promise((_res, rej) => {
      opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('abort'), { name: 'AbortError' })));
    })));
    const p = apiFetch('/x', { timeoutMs: 1000 });
    const assertion = expect(p).rejects.toMatchObject({ status: 0, message: expect.stringContaining('terlalu lama') });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
  });

  it('gangguan jaringan menjadi ApiError status 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('network'); }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 0 });
  });
});
