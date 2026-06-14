import { useEffect, useRef, useState } from 'react';

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
 * Subscribe to one or more Mercure topics via `EventSource`.
 *
 * Topics can be:
 *   - a single absolute URL: every update to that exact resource arrives
 *   - an RFC 6570 URI template (e.g. ".../customers/{id}"): every member
 *     of the templated set, so a list page can listen for all rows at once
 *   - an array of either
 *
 * The hook returns:
 *   - `connected`   — true once `onopen` fires, flipped back on error
 *   - `lastMessage` — most recent parsed frame; convenient for inline UI
 *                     hints ("last update 2s ago") without an extra state
 *
 * Auth: the Coolify Mercure container is currently configured with
 * `anonymous: true` (see reference_worktide_mercure memory) so no JWT is
 * required for subscribers. When we flip that off in production this hook
 * will need to pass an `Authorization: Bearer` header, which standard
 * EventSource doesn't support — at that point swap for the
 * `event-source-polyfill` package and pass the JWT through.
 */
export function useMercureTopic<T = unknown>(
  topics: string | string[] | null | undefined,
  options: UseMercureTopicOptions<T> = {},
): { connected: boolean; lastMessage: MercureMessage<T> | null } {
  const { onMessage, enabled = true } = options;
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<MercureMessage<T> | null>(null);

  // Keep the callback in a ref so a new function reference per render
  // doesn't tear down + rebuild the EventSource. The deps array only
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

    const url = new URL(MERCURE_HUB_URL);
    list.forEach((t) => url.searchParams.append('topic', t));

    const es = new EventSource(url.toString());
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false); // EventSource auto-reconnects on its own
    es.onmessage = (ev) => {
      let parsed: T;
      try {
        parsed = JSON.parse(ev.data) as T;
      } catch (err) {
        // Mercure sometimes sends keepalive comments that the browser
        // still hands to onmessage — guard against non-JSON frames.
        console.warn('useMercureTopic: non-JSON frame ignored', err);
        return;
      }
      const msg: MercureMessage<T> = { data: parsed, id: ev.lastEventId };
      setLastMessage(msg);
      onMessageRef.current?.(msg);
    };

    return () => {
      es.close();
      setConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicKey, enabled]);

  return { connected, lastMessage };
}
