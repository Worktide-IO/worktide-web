import { useCallback, useRef, useState } from 'react';

import { api, classifyError } from '@/lib/api';
import { drainPendingQueue, enqueueMutation } from '@/lib/pendingQueue';

/**
 * Wrap a PATCH/PUT/POST call so a network blink doesn't lose the write.
 *
 * Behaviour:
 *  1. Try the request once with axios (already has the 30 s timeout).
 *  2. If it succeeds → status 'success', return the response data.
 *  3. If it fails with a network class (offline / timeout) → push the
 *     payload onto the persistent pending queue, status 'queued',
 *     resolve with `null`. The queue drains itself on `online` and on
 *     `wt-network-status.recovered`.
 *  4. If it fails with a non-network class (4xx/5xx) → status 'error',
 *     reject so the caller can show a field-level error.
 *
 * The caller still owns the optimistic-UI part — this hook does not
 * mutate React Query caches. Combine with `useInvalidate` after success
 * or accept the next Mercure frame as the source of truth.
 */
type Method = 'patch' | 'put' | 'post' | 'delete';

export type MutationStatus = 'idle' | 'sending' | 'success' | 'queued' | 'error';

export type ResilientMutationInput = {
  /** Stable identifier so a second write to the same field/row replaces the queued one. */
  key: string;
  method: Method;
  url: string;
  body?: unknown;
  /** Optional Content-Type override (defaults to API Platform's ld+json or merge-patch via axios). */
  contentType?: string;
  /** Human-readable label shown in the autosave toast. */
  label: string;
};

export type UseResilientMutationResult = {
  mutate: <T = unknown>(input: ResilientMutationInput) => Promise<T | null>;
  status: MutationStatus;
  /** Last error message — populated when status==='error'. */
  error: string | null;
  /** Truthy while a request is in flight OR a recent failure is still queued. */
  isPending: boolean;
};

export function useResilientMutation(): UseResilientMutationResult {
  const [status, setStatus] = useState<MutationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // Track the most-recent attempt so a stale resolve from an earlier
  // call doesn't overwrite a newer attempt's state.
  const generation = useRef(0);

  const mutate = useCallback(async <T = unknown>(input: ResilientMutationInput) => {
    const mine = ++generation.current;
    setStatus('sending');
    setError(null);
    try {
      const headers = input.contentType ? { 'Content-Type': input.contentType } : undefined;
      const res = await api.request<T>({
        method: input.method,
        url: input.url,
        data: input.body,
        ...(headers ? { headers } : {}),
      });
      if (generation.current === mine) {
        setStatus('success');
        setError(null);
      }
      return res.data;
    } catch (err) {
      const kind = classifyError(err);
      if (kind === 'offline' || kind === 'timeout') {
        enqueueMutation({
          key: input.key,
          method: input.method,
          url: input.url,
          body: input.body,
          contentType: input.contentType,
          label: input.label,
        });
        if (generation.current === mine) {
          setStatus('queued');
        }
        // Try to drain immediately in case it was just a transient
        // failure (think: cold-started ddev backend that responded on
        // the very next attempt). Fire-and-forget.
        void drainPendingQueue();
        return null;
      }
      if (generation.current === mine) {
        setStatus('error');
        setError(extractMessage(err));
      }
      throw err;
    }
  }, []);

  return {
    mutate,
    status,
    error,
    isPending: status === 'sending' || status === 'queued',
  };
}

function extractMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { detail?: string; title?: string } }; message?: string };
    return e.response?.data?.detail ?? e.response?.data?.title ?? e.message ?? 'Unbekannter Fehler';
  }
  return 'Unbekannter Fehler';
}
