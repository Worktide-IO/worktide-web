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

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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

const DROPDOWN_LIMIT = 8;

/**
 * Header bell: unread badge (9+ cap), a dropdown of the most recent
 * notifications with per-item + bulk "mark read", and a link to the full
 * Benachrichtigungen page. Live-updates via the per-user Mercure topic the
 * backend publishes each new notification to.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<Identity>();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    notificationsApi
      .list({ limit: DROPDOWN_LIMIT })
      .then((d) => {
        setItems(d.items);
        setUnread(d.unreadCount);
      })
      .catch(() => {
        /* non-critical — leave the bell as-is */
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Live push: a new notification for this user re-loads the bell.
  useMercureTopic(identity?.id ? notificationsTopic(identity.id) : null, {
    onMessage: () => load(),
  });

  function markOne(n: Notification) {
    if (n.read) return;
    setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)));
    setUnread((c) => Math.max(0, c - 1));
    notificationsApi.markRead(n.id).catch(() => load());
  }

  function markAll() {
    setItems((prev) => prev.map((it) => ({ ...it, read: true })));
    setUnread(0);
    notificationsApi.markAllRead().catch(() => load());
  }

  function go(n: Notification) {
    markOne(n);
    setOpen(false);
    navigate(n.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t('notifications.title')}
          className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-4 text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-sm font-semibold">{t('notifications.title')}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={markAll}
            disabled={unread === 0}
          >
            <CheckCheck className="size-3.5" />
            Alle gelesen
          </Button>
        </div>

        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Keine Benachrichtigungen.
          </p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto">
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
                        {!n.read ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
                        ) : null}
                      </span>
                      {n.body ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-xs text-muted-foreground/80">
                        {timeAgo(n.occurredAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="border-t px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            onClick={() => {
              setOpen(false);
              navigate('/benachrichtigungen');
            }}
          >
            Alle anzeigen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
