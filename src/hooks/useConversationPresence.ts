import { useCallback, useEffect, useState } from 'react';
import { useGetIdentity } from '@refinedev/core';

import { api } from '@/lib/api';
import { useMercureTopic } from '@/lib/mercure';

type Identity = { id?: string };

type PresenceFrame = {
  userId: string;
  name: string;
  state: 'viewing' | 'left';
  at: string;
};

export type PresentViewer = {
  userId: string;
  name: string;
  lastSeen: number;
};

/** How often we announce ourselves while the conversation is open. */
const HEARTBEAT_MS = 20_000;
/** Drop a peer we haven't heard from in this long (≈ 2 missed heartbeats + slack). */
const STALE_MS = 50_000;
/** Prune cadence for expiring stale peers. */
const PRUNE_MS = 10_000;

/**
 * Collision detection for a conversation: announces the current user as a
 * viewer (heartbeat via the voter-gated POST /conversations/{id}/presence,
 * relayed over Mercure) and returns the OTHER viewers currently present.
 *
 * Stateless by design — no server presence store. We gossip a heartbeat and
 * expire peers locally, so a crashed tab simply ages out after STALE_MS.
 */
export function useConversationPresence(conversationId: string | undefined): PresentViewer[] {
  const { data: identity } = useGetIdentity<Identity>();
  const selfId = identity?.id;
  const [viewers, setViewers] = useState<Record<string, PresentViewer>>({});

  const topic = conversationId ? `worktide:conversation:${conversationId}:presence` : null;

  const announce = useCallback(
    (state: 'viewing' | 'left') => {
      if (!conversationId) return;
      // Fire-and-forget; a failed heartbeat is self-healing on the next tick.
      void api.post(`/conversations/${conversationId}/presence`, { state }).catch(() => {});
    },
    [conversationId],
  );

  // Heartbeat while mounted; best-effort "left" on unmount.
  useEffect(() => {
    if (!conversationId) return;
    announce('viewing');
    const iv = window.setInterval(() => announce('viewing'), HEARTBEAT_MS);
    return () => {
      window.clearInterval(iv);
      announce('left');
    };
  }, [conversationId, announce]);

  // Reset when switching conversations.
  useEffect(() => {
    setViewers({});
  }, [conversationId]);

  useMercureTopic<PresenceFrame>(topic, {
    onMessage: ({ data }) => {
      if (!data?.userId || data.userId === selfId) return; // ignore self
      setViewers((prev) => {
        if (data.state === 'left') {
          if (!prev[data.userId]) return prev;
          const next = { ...prev };
          delete next[data.userId];
          return next;
        }
        return {
          ...prev,
          [data.userId]: { userId: data.userId, name: data.name, lastSeen: Date.now() },
        };
      });
    },
  });

  // Expire peers that went quiet (closed tab without a clean "left").
  useEffect(() => {
    const iv = window.setInterval(() => {
      const cutoff = Date.now() - STALE_MS;
      setViewers((prev) => {
        const fresh = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.lastSeen >= cutoff));
        return Object.keys(fresh).length === Object.keys(prev).length ? prev : fresh;
      });
    }, PRUNE_MS);
    return () => window.clearInterval(iv);
  }, []);

  return Object.values(viewers).sort((a, b) => a.name.localeCompare(b.name));
}
