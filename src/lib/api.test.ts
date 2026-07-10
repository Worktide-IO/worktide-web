import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, JWT_STORAGE_KEY, REFRESH_STORAGE_KEY, readAuth, writeAuth } from './api';

/**
 * 401 → refresh → replay contract (web M2). We drive the REAL response
 * interceptor from api.ts through a stubbed axios adapter, so the shipped code
 * path runs rather than a reimplementation. The adapter decides 401-vs-200 from
 * the Bearer token, mirroring the backend: the stale JWT is rejected, the
 * freshly-refreshed one accepted. A custom adapter must enforce validateStatus
 * itself (reject non-2xx) — else a resolved 401 reads as success and the error
 * interceptor never fires.
 */

function authHeader(config: InternalAxiosRequestConfig): string {
  return String(config.headers?.get?.('Authorization') ?? '');
}

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response = { data, status, statusText: '', headers: {}, config } as unknown as AxiosResponse;
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('Request failed', AxiosError.ERR_BAD_REQUEST, config, null, response));
}

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

let refreshCalls: number;
/** When true the refresh endpoint itself answers 401 (revoked/expired token). */
let refreshFails: boolean;

function installAdapter(): void {
  const adapter: AxiosAdapter = (config) => {
    const url = `${config.baseURL ?? ''}${config.url ?? ''}`;
    if (url.includes('/auth/refresh')) {
      refreshCalls += 1;
      return refreshFails
        ? reply(config, 401, { error: 'invalid refresh token' })
        : reply(config, 200, { token: 'jwt-new', refresh_token: 'refresh-new' });
    }
    return authHeader(config) === 'Bearer jwt-new'
      ? reply(config, 200, { ok: true })
      : reply(config, 401, { error: 'expired' });
  };
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('sessionStorage', fakeStorage());
  refreshCalls = 0;
  refreshFails = false;
  installAdapter();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api 401 refresh interceptor (M2)', () => {
  it('refreshes once and replays the original request with the new token', async () => {
    writeAuth(JWT_STORAGE_KEY, 'jwt-stale');
    writeAuth(REFRESH_STORAGE_KEY, 'refresh-1');

    const res = await api.get('/tasks');

    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(readAuth(JWT_STORAGE_KEY)).toBe('jwt-new');
    expect(readAuth(REFRESH_STORAGE_KEY)).toBe('refresh-new');
  });

  it('coalesces concurrent 401s into a single refresh (rotation-safe)', async () => {
    writeAuth(JWT_STORAGE_KEY, 'jwt-stale');
    writeAuth(REFRESH_STORAGE_KEY, 'refresh-1');

    const all = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);

    expect(all.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
  });

  it('rejects (for authProvider to log out) when refresh fails', async () => {
    writeAuth(JWT_STORAGE_KEY, 'jwt-stale');
    writeAuth(REFRESH_STORAGE_KEY, 'refresh-bad');
    refreshFails = true;

    await expect(api.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(1);
  });

  it('does not attempt a refresh when there is no refresh token', async () => {
    writeAuth(JWT_STORAGE_KEY, 'jwt-stale'); // no refresh token stored

    await expect(api.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(0);
  });

  it('a no-token 401 does not poison later refreshes (inflight-leak regression)', async () => {
    // A 401 with NO refresh token must not cache a stuck resolved-false
    // in-flight promise, or every subsequent refresh short-circuits to false.
    writeAuth(JWT_STORAGE_KEY, 'jwt-stale');
    await expect(api.get('/a')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(0);

    // The user now has a refresh token — a later 401 must actually refresh + replay.
    writeAuth(REFRESH_STORAGE_KEY, 'refresh-1');
    const res = await api.get('/b');
    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });

  it('does not retry a second time if the replay also 401s', async () => {
    writeAuth(JWT_STORAGE_KEY, 'jwt-stale');
    writeAuth(REFRESH_STORAGE_KEY, 'refresh-1');
    // Refresh "succeeds" but the adapter never honours the new token either.
    const adapter: AxiosAdapter = (config) => {
      const url = `${config.baseURL ?? ''}${config.url ?? ''}`;
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return reply(config, 200, { token: 'jwt-new', refresh_token: 'refresh-new' });
      }
      return reply(config, 401, { error: 'still expired' });
    };
    api.defaults.adapter = adapter;
    axios.defaults.adapter = adapter;

    await expect(api.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(1); // exactly one refresh attempt, no infinite loop
  });
});
