import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

type KeysetOptions<T> = {
  /** API-Platform resource path segment, e.g. 'conversations'. */
  resource: string;
  /** The (indexed, orderable + DateFilter'd) field to sort + keyset on. */
  orderField: string;
  /** Extract the cursor value (the orderField value) from an item. */
  cursorOf: (item: T) => string | undefined;
  /** Static exact filters (e.g. { status: 'open', conversation: '/v1/…' }). */
  filters?: Record<string, string | number | boolean | undefined>;
  pageSize?: number;
  enabled?: boolean;
};

type KeysetList<T> = {
  items: T[];
  isLoading: boolean;
  hasMore: boolean;
  loadMore: () => void;
  reset: () => void;
};

/**
 * Cursor (keyset) infinite list over an API-Platform collection — avoids the
 * OFFSET scan that makes deep offset paging slow on large tables. Pages walk
 * from newest to older via `?order[field]=desc&field[before]=<cursor>`, which
 * the Refine dataProvider's range-filter mapping already speaks (needs a
 * DateFilter on `field` server-side).
 *
 * Render order = load order (desc). For a chat thread, merge + sort ascending
 * at the call site; "load older" is just loadMore().
 */
export function useKeysetList<T>(options: KeysetOptions<T>): KeysetList<T> {
  const { resource, orderField, pageSize = 50, enabled = true } = options;

  // Keep per-render values in refs so they don't churn the effect deps; the
  // filter identity is tracked via a stable stringified key instead. Refs are
  // synced in an effect (never mutated during render).
  const cursorOfRef = useRef(options.cursorOf);
  const filtersRef = useRef(options.filters ?? {});
  const filterKey = JSON.stringify(options.filters ?? {});

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  const cursorRef = useRef<string | undefined>(undefined);
  const busyRef = useRef(false);

  useEffect(() => {
    cursorOfRef.current = options.cursorOf;
    filtersRef.current = options.filters ?? {};
  });

  const buildParams = (cursor: string | undefined): Record<string, unknown> => {
    const params: Record<string, unknown> = {
      [`order[${orderField}]`]: 'desc',
      itemsPerPage: pageSize,
    };
    for (const [k, v] of Object.entries(filtersRef.current)) {
      if (v !== undefined && v !== '' && v !== 'all') params[k] = v;
    }
    if (cursor) params[`${orderField}[before]`] = cursor;
    return params;
  };

  const extract = (data: unknown): T[] => {
    const d = data as Record<string, unknown>;
    return (d['hydra:member'] as T[]) ?? (d.member as T[]) ?? [];
  };

  // Initial load + reload on filter/resource/reset change. No synchronous
  // setState in the effect body — only inside the async resolution.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    busyRef.current = true;
    api
      .get(`/${resource}`, { params: buildParams(undefined) })
      .then(({ data }) => {
        if (!active) return;
        const members = extract(data);
        cursorRef.current = members.length ? cursorOfRef.current(members[members.length - 1]) : undefined;
        setItems(members);
        setHasMore(members.length === pageSize);
      })
      .catch(() => {})
      .finally(() => {
        if (active) busyRef.current = false;
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resource, orderField, pageSize, filterKey, resetKey]);

  const loadMore = useCallback(() => {
    if (!enabled || !hasMore || busyRef.current) return;
    busyRef.current = true;
    setIsLoading(true);
    api
      .get(`/${resource}`, { params: buildParams(cursorRef.current) })
      .then(({ data }) => {
        const members = extract(data);
        if (members.length > 0) {
          cursorRef.current = cursorOfRef.current(members[members.length - 1]);
        }
        setHasMore(members.length === pageSize);
        setItems((prev) => [...prev, ...members]);
      })
      .catch(() => {})
      .finally(() => {
        busyRef.current = false;
        setIsLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, hasMore, resource, orderField, pageSize]);

  const reset = useCallback(() => setResetKey((k) => k + 1), []);

  return { items, isLoading, hasMore, loadMore, reset };
}
