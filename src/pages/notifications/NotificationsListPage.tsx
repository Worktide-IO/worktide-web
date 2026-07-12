import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGetIdentity } from '@refinedev/core';
import { useNavigate } from 'react-router';
import {
  AtSign,
  Bell,
  CheckCheck,
  MessageSquare,
  Rocket,
  Server,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { timeAgo } from '@/lib/time';
import {
  notificationsApi,
  notificationsTopic,
  type Notification,
} from '@/lib/notifications';
import { useMercureTopic } from '@/lib/mercure';

type Identity = { id: string };

const TYPE_ICON: Record<string, LucideIcon> = {
  mention: AtSign,
  task_assigned: UserPlus,
  comment: MessageSquare,
  system: Server,
  ai: Sparkles,
  launch: Rocket,
};

const PAGE_SIZE = 25;

/** Full Benachrichtigungen page — the whole inbox, paged with "Mehr laden". */
export function NotificationsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<Identity>();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  const reset = useCallback(() => {
    // No synchronous setState here — `loading` starts true and is cleared in
    // finally, so the initial mount effect stays free of cascading renders.
    notificationsApi
      .list({ limit: PAGE_SIZE })
      .then((d) => {
        setItems(d.items);
        setUnread(d.unreadCount);
        setCursor(d.nextCursor);
        setHasMore(d.nextCursor !== null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reset();
  }, [reset]);

  useMercureTopic(identity?.id ? notificationsTopic(identity.id) : null, {
    onMessage: () => reset(),
  });

  function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    notificationsApi
      .list({ limit: PAGE_SIZE, cursor })
      .then((d) => {
        setItems((prev) => [...prev, ...d.items]);
        setCursor(d.nextCursor);
        setHasMore(d.nextCursor !== null);
      })
      .finally(() => setLoading(false));
  }

  function markOne(n: Notification) {
    if (n.read) return;
    setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)));
    setUnread((c) => Math.max(0, c - 1));
    notificationsApi.markRead(n.id).catch(() => reset());
  }

  function markAll() {
    setItems((prev) => prev.map((it) => ({ ...it, read: true })));
    setUnread(0);
    notificationsApi.markAllRead().catch(() => reset());
  }

  function go(n: Notification) {
    markOne(n);
    navigate(n.link);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t('notifications.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {unread > 0 ? `${unread} ungelesen` : 'Alles gelesen'}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={markAll} disabled={unread === 0}>
          <CheckCheck className="size-4" />
          Alle als gelesen markieren
        </Button>
      </div>

      {items.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          <Bell className="mx-auto mb-2 size-6 opacity-40" />
          {t('notifications.empty')}
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((n) => {
            const Icon = TYPE_ICON[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => go(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-accent ${n.read ? '' : 'bg-accent/40'}`}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{n.title}</span>
                      {!n.read ? <span className="size-1.5 shrink-0 rounded-full bg-red-500" /> : null}
                    </span>
                    {n.body ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                    ) : null}
                    <span className="mt-1 block text-xs text-muted-foreground/80">
                      {timeAgo(n.occurredAt)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
            {loading ? t('app.loading') : t('common.load_more')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
