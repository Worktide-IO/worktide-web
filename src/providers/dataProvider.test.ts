import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dataProvider } from './dataProvider';
import { api } from '@/lib/api';

/**
 * getMany batch-probe cache (web M5). The per-resource `idBatchable` memo must
 * only lock in a DEFINITIVE verdict: an empty batch result (filter honoured,
 * nothing matched) or a transient error must NOT brand a resource per-id for
 * the rest of the session. Each test uses a UNIQUE resource name so the
 * module-global memo can't leak between tests.
 */

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

function ok(config: InternalAxiosRequestConfig, data: unknown): Promise<AxiosResponse> {
  return Promise.resolve({ data, status: 200, statusText: '', headers: {}, config } as unknown as AxiosResponse);
}
function fail(config: InternalAxiosRequestConfig, status: number): Promise<AxiosResponse> {
  const response = { data: {}, status, statusText: '', headers: {}, config } as unknown as AxiosResponse;
  return Promise.reject(new AxiosError('boom', AxiosError.ERR_BAD_RESPONSE, config, null, response));
}

/** Requests seen this test, by URL, so we can assert batch-vs-per-id. */
let requests: string[];

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
  vi.stubGlobal('sessionStorage', fakeStorage());
  vi.stubGlobal('navigator', { onLine: true });
  // The banner interceptor may schedule a recovery timer after a non-2xx; a
  // no-op setTimeout keeps it from touching a real timer/emitting.
  vi.stubGlobal('window', { setTimeout: () => 0, clearTimeout: () => {}, dispatchEvent: () => true });
  requests = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** members shaped like API-Platform Hydra rows. */
const row = (id: string) => ({ '@id': `/resourceX/${id}`, id });

function installAdapter(handler: (url: string, config: InternalAxiosRequestConfig) => Promise<AxiosResponse>): void {
  const adapter: AxiosAdapter = (config) => {
    const url = `${config.url ?? ''}`;
    requests.push(url);
    return handler(url, config);
  };
  api.defaults.adapter = adapter;
  axios.defaults.adapter = adapter;
}

describe('getMany batch-probe cache (M5)', () => {
  it('serves a batched request and remembers the resource is batchable', async () => {
    installAdapter((url, config) => {
      if (url.includes('id%5B%5D') || url.includes('id[]')) {
        return ok(config, { member: [row('a'), row('b')] });
      }
      return ok(config, row(url.split('/').pop() ?? ''));
    });

    const res = await dataProvider.getMany!({ resource: 'batch-ok', ids: ['a', 'b'] });
    expect((res.data as Array<{ id: string }>).map((r) => r.id)).toEqual(['a', 'b']);
    // One batched request, zero per-id.
    expect(requests.filter((u) => u.includes('id')).length).toBe(1);
    expect(requests.some((u) => /\/batch-ok\/[ab]$/.test(u))).toBe(false);
  });

  it('treats an EMPTY batch result as "filter honoured, nothing matched" — data:[] and no false-cache', async () => {
    let batchCalls = 0;
    installAdapter((url, config) => {
      if (url.includes('id%5B%5D') || url.includes('id[]')) {
        batchCalls += 1;
        return ok(config, { member: [] }); // all requested ids missing
      }
      return ok(config, row(url.split('/').pop() ?? ''));
    });

    const res1 = await dataProvider.getMany!({ resource: 'batch-empty', ids: ['x', 'y'] });
    expect(res1.data).toEqual([]);
    // A SECOND call must still probe the batch endpoint (not brand per-id).
    const res2 = await dataProvider.getMany!({ resource: 'batch-empty', ids: ['x', 'y'] });
    expect(res2.data).toEqual([]);
    expect(batchCalls).toBe(2); // re-probed, never fell back to per-id
    expect(requests.some((u) => /\/batch-empty\/[xy]$/.test(u))).toBe(false);
  });

  it('caches false only when the server demonstrably ignored the filter', async () => {
    let batchCalls = 0;
    installAdapter((url, config) => {
      if (url.includes('id%5B%5D') || url.includes('id[]')) {
        batchCalls += 1;
        // Returns an unrelated row we never asked for → filter ignored.
        return ok(config, { member: [row('a'), row('b'), row('zzz-unrelated')] });
      }
      return ok(config, row(url.split('/').pop() ?? ''));
    });

    const r1 = await dataProvider.getMany!({ resource: 'batch-ignored', ids: ['a', 'b'] });
    expect((r1.data as Array<{ id: string }>).map((r) => r.id)).toEqual(['a', 'b']); // per-id fallback
    // Second call goes STRAIGHT to per-id (cached false), no re-probe.
    await dataProvider.getMany!({ resource: 'batch-ignored', ids: ['a', 'b'] });
    expect(batchCalls).toBe(1);
    expect(requests.filter((u) => /\/batch-ignored\/[ab]$/.test(u)).length).toBe(4); // 2 ids × 2 calls
  });

  it('does NOT cache false on a transient error — re-probes next time', async () => {
    let batchCalls = 0;
    let firstBatchFailed = false;
    installAdapter((url, config) => {
      if (url.includes('id%5B%5D') || url.includes('id[]')) {
        batchCalls += 1;
        if (!firstBatchFailed) {
          firstBatchFailed = true;
          return fail(config, 500); // transient
        }
        return ok(config, { member: [row('a'), row('b')] });
      }
      return ok(config, row(url.split('/').pop() ?? ''));
    });

    // First call: batch 500 → per-id fallback (must not cache false).
    const r1 = await dataProvider.getMany!({ resource: 'batch-transient', ids: ['a', 'b'] });
    expect((r1.data as Array<{ id: string }>).map((r) => r.id)).toEqual(['a', 'b']);
    // Second call: re-probes the batch endpoint and now succeeds.
    const r2 = await dataProvider.getMany!({ resource: 'batch-transient', ids: ['a', 'b'] });
    expect((r2.data as Array<{ id: string }>).map((r) => r.id)).toEqual(['a', 'b']);
    expect(batchCalls).toBe(2); // probed both times — the 500 didn't disable batching
  });
});
