import { useInvalidate } from '@refinedev/core';
import { EventSourcePlus } from 'event-source-plus';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api';

/**
 * Mercure hub + topic-prefix constants.
 *
 * MERCURE_HUB_URL is the absolute URL of the Mercure hub that both the
 * Symfony backend (publish) and this SPA (subscribe) talk to. The two
 * sides MUST agree byte-for-byte on the topic strings, so the topic
 * prefix is derived from VITE_API_PUBLIC_BASE — even though the data
 * provider hits `/v1` via the dev proxy, Mercure topics use the absolute
 * backend URL because that's what API Platform publishes them as.
 */
export const MERCURE_HUB_URL: string =
  import.meta.env.VITE_MERCURE_HUB_URL ??
  'https://worktide-mercure.wappler.systems/.well-known/mercure';

export const API_PUBLIC_BASE: string =
  import.meta.env.VITE_API_PUBLIC_BASE ?? 'https://api.worktide.ddev.site/v1';

/**
 * Build a Mercure topic IRI for a resource. Pass `null` as id to get a
 * URI-template that matches every member of the collection (used for
 * live-updating lists).
 *
 *   topicFor('customers')        → "https://…/v1/customers/{id}"
 *   topicFor('customers', uuid)  → "https://…/v1/customers/<uuid>"
 */
export function topicFor(resource: string, id?: string | null): string {
  return id
    ? `${API_PUBLIC_BASE}/${resource}/${id}`
    : `${API_PUBLIC_BASE}/${resource}/{id}`;
}

/**
 * In-process cache of the Mercure JWT. The hub-side token has a 30-minute
 * lifetime; we refresh 60 seconds before the actual expiry so a
 * long-lived subscription doesn't see a 401 between fetch and use.
 *
 * The cache is module-scoped (singleton) so multiple useMercureTopic
 * hooks share one token + one fetch. A future "user switched" flow
 * should call `clearMercureToken()` to drop the cache.
 */
let cachedToken: { jwt: string; expiresAtMs: number } | null = null;
let inflight: Promise<string> | null = null;

async function getMercureToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
    return cachedToken.jwt;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await api.get<{ token: string; expiresAt: string }>(
        '/auth/mercure-token',
      );
      cachedToken = {
        jwt: data.token,
        expiresAtMs: new Date(data.expiresAt).getTime(),
      };
      return data.token;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Wipe the cached token. Call on logout / workspace switch / auth error. */
export function clearMercureToken(): void {
  cachedToken = null;
  inflight = null;
}

export type MercureMessage<T> = {
  /** Parsed JSON payload — usually the JSON-LD representation of the changed entity. */
  data: T;
  /** Mercure-emitted SSE id, useful for resume-after-reconnect via Last-Event-ID. */
  id?: string;
};

export type UseMercureTopicOptions<T> = {
  /**
   * Called on every received frame after the JSON parse. Use this for
   * side effects like `queryClient.invalidateQueries(...)` — the function
   * is invoked with the parsed payload, not the raw event.
   */
  onMessage?: (msg: MercureMessage<T>) => void;
  /** Disable the subscription without unmounting the consumer. Default: enabled. */
  enabled?: boolean;
};

/**
 * Subscribe to one or more Mercure topics with the user-scoped JWT
 * issued by `/v1/auth/mercure-token`.
 *
 * Implementation notes:
 *  - Uses `event-source-plus` (fetch-based) instead of the browser-native
 *    `EventSource` because native EventSource cannot send `Authorization`
 *    headers, and we run the hub in non-anonymous mode.
 *  - Topics can be exact IRIs (per-row updates) or RFC 6570 URI templates
 *    (".../customers/{id}") that match every member of a collection.
 *  - The JWT is fetched lazily on first subscription and shared across
 *    every other useMercureTopic call via the module-scoped cache.
 *
 * Returns:
 *   - `connected`   — true once the first frame (incl. the SSE-keepalive
 *                     comment) arrives, flipped back on error.
 *   - `lastMessage` — most recent parsed payload; convenient for inline
 *                     "last update 2s ago" hints without extra state.
 */
export function useMercureTopic<T = unknown>(
  topics: string | string[] | null | undefined,
  options: UseMercureTopicOptions<T> = {},
): { connected: boolean; lastMessage: MercureMessage<T> | null } {
  const { onMessage, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<MercureMessage<T> | null>(null);

  // Keep the callback in a ref so a new function reference per render
  // doesn't tear down + rebuild the subscription. The deps array only
  // watches the topic list.
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const topicKey = Array.isArray(topics) ? topics.join('|') : topics ?? '';

  useEffect(() => {
    if (!enabled || !topicKey) {
      setConnected(false);
      return;
    }
    const list = Array.isArray(topics) ? topics : topics ? [topics] : [];
    if (list.length === 0) return;

    let cancelled = false;
    let controller: { abort: () => void } | null = null;

    (async () => {
      let jwt: string;
      try {
        jwt = await getMercureToken();
      } catch (err) {
        console.warn('useMercureTopic: failed to fetch JWT, subscription skipped', err);
        return;
      }
      if (cancelled) return;

      const url = new URL(MERCURE_HUB_URL);
      list.forEach((t) => url.searchParams.append('topic', t));

      const es = new EventSourcePlus(url.toString(), {
        headers: { Authorization: `Bearer ${jwt}` },
        // event-source-plus retries by default; bound the attempts so a
        // hub outage doesn't burn through the user's network forever.
        maxRetryCount: 10,
        maxRetryInterval: 10_000,
      });

      controller = es.listen({
        onMessage(msg) {
          if (cancelled) return;
          setConnected(true);
          let parsed: T;
          try {
            parsed = JSON.parse(msg.data) as T;
          } catch (err) {
            console.warn('useMercureTopic: non-JSON frame ignored', err);
            return;
          }
          const out: MercureMessage<T> = { data: parsed, id: msg.id };
          setLastMessage(out);
          onMessageRef.current?.(out);
        },
        onRequestError({ error }) {
          if (cancelled) return;
          setConnected(false);
          // 401 from the hub probably means the token expired; nudge a
          // refresh on the next read instead of failing silently.
          if (typeof error === 'object' && error && 'status' in error && error.status === 401) {
            clearMercureToken();
          }
        },
        onResponseError() {
          setConnected(false);
        },
      });
    })();

    return () => {
      cancelled = true;
      controller?.abort();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, enabled]);

  return { connected, lastMessage };
}

/**
 * Higher-level convenience for list pages: subscribes to the resource's
 * URI-template (covers every member) and invalidates the Refine list
 * query whenever a frame arrives. Returns `{ connected }` so the page
 * can render a Live/offline badge in the header.
 *
 * Replaces the ~10-line copy-paste of `useMercureTopic + useInvalidate`
 * that every list page would otherwise duplicate. Pass `enabled: false`
 * to pause the subscription without unmounting the consumer.
 */
export function useLiveResource(
  resource: string,
  options: { enabled?: boolean } = {},
): { connected: boolean } {
  const invalidate = useInvalidate();
  const onMessage = useCallback(() => {
    void invalidate({ resource, invalidates: ['list'] });
  }, [invalidate, resource]);

  const { connected } = useMercureTopic(topicFor(resource), {
    enabled: options.enabled,
    onMessage,
  });
  return { connected };
}
