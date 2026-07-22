import { useInvalidate } from '@refinedev/core';
import { EventSourcePlus } from 'event-source-plus';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '@/lib/api'
import { recordError } from '@/lib/diagnostics';

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

/**
 * Cross-component Mercure health signal — one number that the
 * status pill renders directly. We count active subscriptions and
 * the running tally of "any of them dropped". A dedicated
 * CustomEvent keeps the pill decoupled from React state ownership.
 *
 *  - 'connected'    — at least one live subscription
 *  - 'reconnecting' — one or more subscriptions are retrying
 *  - 'offline'      — every subscription is errored out
 *  - 'idle'         — no subscriptions registered yet (initial mount)
 */
export type MercureHealth = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

let subscriptionCount = 0;
let connectedCount = 0;
let erroredCount = 0;

function computeHealth(): MercureHealth {
  if (subscriptionCount === 0) return 'idle';
  if (connectedCount > 0 && erroredCount === 0) return 'connected';
  if (connectedCount > 0 && erroredCount > 0) return 'reconnecting';
  if (erroredCount > 0) return 'reconnecting';
  return 'connecting';
}

declare global {
  interface WindowEventMap {
    'wt-mercure-status': CustomEvent<{ health: MercureHealth }>;
  }
}

function publishMercureHealth(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('wt-mercure-status', { detail: { health: computeHealth() } }),
  );
}

export function readMercureHealth(): MercureHealth {
  return computeHealth();
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
    let registered = false;
    let countedConnected = false;
    let countedErrored = false;

    subscriptionCount += 1;
    registered = true;
    publishMercureHealth();

    (async () => {
      let jwt: string;
      try {
        jwt = await getMercureToken();
      } catch (err) {
        console.warn('useMercureTopic: failed to fetch JWT, subscription skipped', err);
        recordError('mercure.jwt_fetch_failed', { error: String(err) });
        if (!cancelled) {
          erroredCount += 1;
          countedErrored = true;
          publishMercureHealth();
        }
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

      // Flip to "connected" bookkeeping. Mercure keeps the SSE stream alive
      // with keepalive *comments* (`:`) that never trigger onMessage, so we
      // must treat a healthy open response (2xx) as connected — otherwise an
      // idle subscription sits on "connecting" until an entity actually
      // changes, which is the "verbinde …" pill that never goes green.
      const markConnected = () => {
        if (cancelled) return;
        setConnected(true);
        if (!countedConnected) {
          connectedCount += 1;
          countedConnected = true;
        }
        if (countedErrored) {
          erroredCount = Math.max(0, erroredCount - 1);
          countedErrored = false;
        }
        publishMercureHealth();
      };

      controller = es.listen({
        onResponse({ response }) {
          // The SSE stream is open as soon as the hub answers 2xx — the
          // connection is live even before the first data frame arrives.
          if (response.status >= 200 && response.status < 300) {
            markConnected();
          }
        },
        onMessage(msg) {
          if (cancelled) return;
          markConnected();
          let parsed: T;
          try {
            parsed = JSON.parse(msg.data) as T;
          } catch (err) {
            recordError('mercure.non_json_frame', { error: String(err) });
            return;
          }
          const out: MercureMessage<T> = { data: parsed, id: msg.id };
          setLastMessage(out);
          onMessageRef.current?.(out);
        },
        onRequestError({ error }) {
          if (cancelled) return;
          setConnected(false);
          if (countedConnected) {
            connectedCount = Math.max(0, connectedCount - 1);
            countedConnected = false;
          }
          if (!countedErrored) {
            erroredCount += 1;
            countedErrored = true;
          }
          publishMercureHealth();
          // 401 from the hub probably means the token expired; nudge a
          // refresh on the next read instead of failing silently.
          if (typeof error === 'object' && error && 'status' in error && error.status === 401) {
            clearMercureToken();
          }
        },
        onResponseError() {
          if (cancelled) return;
          setConnected(false);
          if (countedConnected) {
            connectedCount = Math.max(0, connectedCount - 1);
            countedConnected = false;
          }
          if (!countedErrored) {
            erroredCount += 1;
            countedErrored = true;
          }
          publishMercureHealth();
        },
      });
    })();

    return () => {
      cancelled = true;
      controller?.abort();
      setConnected(false);
      if (registered) {
        subscriptionCount = Math.max(0, subscriptionCount - 1);
        if (countedConnected) {
          connectedCount = Math.max(0, connectedCount - 1);
        }
        if (countedErrored) {
          erroredCount = Math.max(0, erroredCount - 1);
        }
        publishMercureHealth();
      }
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
