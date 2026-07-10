import axios, {
  AxiosError,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, getAccessToken, refreshAccessToken, setAccessToken } from './api';

/**
 * Auth model (M1): access token in memory, refresh token in an httpOnly cookie.
 * We drive the REAL interceptor + refresh through a stubbed axios adapter. The
 * adapter honours "Bearer jwt-new" as the refreshed access token and treats the
 * stale one as expired; the refresh endpoint always succeeds here (the cookie is
 * assumed present — the browser attaches it, invisible to JS).
 */

function authHeader(config: InternalAxiosRequestConfig): string {
  return String(config.headers?.get?.('Authorization') ?? '');
}

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown): Promise<AxiosResponse> {
  const response = { data, status, statusText: '', headers: {}, config } as unknown as AxiosResponse;
  if (status >= 200 && status < 300) return Promise.resolve(response);
  return Promise.reject(new AxiosError('Request failed', AxiosError.ERR_BAD_REQUEST, config, null, response));
}

let refreshCalls: number;
/** When true the refresh endpoint answers 401 (no/expired cookie). */
let refreshFails: boolean;

function installAdapter(): void {
  const adapter: AxiosAdapter = (config) => {
    const url = `${config.baseURL ?? ''}${config.url ?? ''}`;
    if (url.includes('/auth/refresh')) {
      refreshCalls += 1;
      return refreshFails ? reply(config, 401, { error: 'no cookie' }) : reply(config, 200, { token: 'jwt-new' });
    }
    return authHeader(config) === 'Bearer jwt-new' ? reply(config, 200, { ok: true }) : reply(config, 401, { error: 'expired' });
  };
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  setAccessToken(null);
  refreshCalls = 0;
  refreshFails = false;
  installAdapter();
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('refreshAccessToken (cookie-based)', () => {
  it('refreshes with no body token and stores the access token in memory', async () => {
    const ok = await refreshAccessToken();
    expect(ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe('jwt-new');
  });

  it('resolves false (no throw) when there is no valid cookie', async () => {
    refreshFails = true;
    const ok = await refreshAccessToken();
    expect(ok).toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it('coalesces concurrent callers into a single refresh', async () => {
    const [a, b, c] = await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(refreshCalls).toBe(1);
  });

  it('a failed refresh does not poison later refreshes (inflight reset)', async () => {
    refreshFails = true;
    expect(await refreshAccessToken()).toBe(false);
    refreshFails = false;
    expect(await refreshAccessToken()).toBe(true);
    expect(getAccessToken()).toBe('jwt-new');
  });
});

describe('api 401 refresh interceptor', () => {
  it('refreshes once and replays the original request with the new token', async () => {
    setAccessToken('jwt-stale');
    const res = await api.get('/tasks');
    expect(res.data).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
    expect(getAccessToken()).toBe('jwt-new');
  });

  it('coalesces concurrent 401s into a single refresh', async () => {
    setAccessToken('jwt-stale');
    const all = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(all.map((r) => r.data)).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshCalls).toBe(1);
  });

  it('rejects (for authProvider to log out) when refresh fails', async () => {
    setAccessToken('jwt-stale');
    refreshFails = true;
    await expect(api.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(1);
  });

  it('does not retry a second time if the replay also 401s', async () => {
    setAccessToken('jwt-stale');
    const adapter: AxiosAdapter = (config) => {
      const url = `${config.baseURL ?? ''}${config.url ?? ''}`;
      if (url.includes('/auth/refresh')) {
        refreshCalls += 1;
        return reply(config, 200, { token: 'jwt-new' });
      }
      return reply(config, 401, { error: 'still expired' });
    };
    api.defaults.adapter = adapter;
    axios.defaults.adapter = adapter;
    await expect(api.get('/tasks')).rejects.toMatchObject({ response: { status: 401 } });
    expect(refreshCalls).toBe(1);
  });
});
