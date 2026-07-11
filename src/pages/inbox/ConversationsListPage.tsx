import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Inbox as InboxIcon, Loader2, Mailbox } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import type { ConversationJsonld } from '@/api/types/conversation/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { topicFor, useMercureTopic } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useKeysetList } from '@/lib/useKeysetList';

const STATUS_LABEL: Record<string, string> = {
  open: 'conversation_status.open',
  pending: 'conversation_status.pending',
  closed: 'conversation_status.closed',
  spam: 'conversation_status.spam',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'default',
  pending: 'secondary',
  closed: 'outline',
  spam: 'destructive',
};

const ROW = 'grid grid-cols-[7rem_11rem_14rem_1fr_9rem] items-center gap-3 px-3';
const ROW_H = 52; // px — fixed row height drives the windowing math
const OVERSCAN = 8;

/**
 * Top-level Inbox. Scales to very large mailboxes: conversations load via a
 * keyset cursor (order[lastEventAt]=desc + lastEventAt[before]) as you scroll,
 * and the row list is windowed (only the visible slice is in the DOM) with a
 * small dependency-free virtualizer.
 */
export function ConversationsListPage() {
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const navigate = useNavigate();

  const filters = useMemo(
    () => ({ status: statusFilter, channel: channelFilter }),
    [statusFilter, channelFilter],
  );

  const { items, isLoading, hasMore, loadMore, reset } = useKeysetList<Row<ConversationJsonld>>({
    resource: 'conversations',
    orderField: 'lastEventAt',
    cursorOf: (c) => (c.lastEventAt ? String(c.lastEventAt) : undefined),
    filters,
    pageSize: 50,
  });

  // New mail (Mercure) → reload the first page so it bubbles to the top.
  useMercureTopic(topicFor('conversations'), { onMessage: () => reset() });

  // Channels are few — one fetch feeds both the filter dropdown and row labels.
  const { result: channels } = useList<Row<ChannelJsonld>>({
    resource: 'channels',
    pagination: { mode: 'off' },
  });
  const channelByIri = useMemo(() => {
    const m: Record<string, Row<ChannelJsonld>> = {};
    for (const c of channels?.data ?? []) if (c['@id']) m[c['@id']] = c;
    return m;
  }, [channels]);

  // --- virtualization (only the visible row slice is in the DOM) ---
  const scrollRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual returns non-memoizable fns; safe here
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H,
    overscan: OVERSCAN,
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl flex items-center gap-2">
          <InboxIcon className="size-6 text-muted-foreground" />
          Inbox
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('inbox.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
          <CardTitle className="text-base">
            {items.length}
            {hasMore ? '+' : ''} {t('inbox.conversations_label', { count: items.length })}
          </CardTitle>
          <div className="ml-auto flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inbox.all_status')}</SelectItem>
                <SelectItem value="open">{t('conversation_status.open')}</SelectItem>
                <SelectItem value="pending">{t('conversation_status.pending')}</SelectItem>
                <SelectItem value="closed">{t('conversation_status.closed')}</SelectItem>
                <SelectItem value="spam">{t('conversation_status.spam')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inbox.all_channels')}</SelectItem>
                {(channels?.data ?? []).map((c) => (
                  <SelectItem key={c['@id']} value={c['@id'] ?? ''}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className={`${ROW} border-b pb-2 text-xs font-medium text-muted-foreground`}>
            <span>{t('inbox.col_status')}</span>
            <span>{t('inbox.col_channel')}</span>
            <span>{t('inbox.col_sender')}</span>
            <span>{t('inbox.col_subject')}</span>
            <span>{t('inbox.col_last_activity')}</span>
          </div>

          {items.length === 0 && !isLoading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t('inbox.empty')}
            </p>
          ) : (
            <div
              ref={scrollRef}
              className="h-[calc(100vh-18rem)] overflow-auto"
              onScroll={(e) => {
                const el = e.currentTarget;
                if (hasMore && !isLoading && el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
                  loadMore();
                }
              }}
            >
              <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative', width: '100%' }}>
                {virtualizer.getVirtualItems().map((vi) => {
                  const c = items[vi.index];
                  if (!c) return null;
                  const status = (c.status as string) ?? 'open';
                  const ch = c.channel ? channelByIri[c.channel] : null;
                  return (
                    <div
                      key={c['@id'] ?? vi.key}
                      className={`${ROW} cursor-pointer border-b hover:bg-muted/50`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${vi.size}px`,
                        transform: `translateY(${vi.start}px)`,
                      }}
                      onClick={() => c.id && navigate(`/inbox/${c.id}`)}
                    >
                      <span>
                        <Badge variant={STATUS_VARIANT[status] ?? 'outline'} className="text-xs">
                          {STATUS_LABEL[status] ? t(STATUS_LABEL[status]) : status}
                        </Badge>
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {ch ? (
                          <span className="inline-flex items-center gap-1">
                            <Mailbox className="size-3" />
                            {ch.name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </span>
                      <span className="truncate text-sm">{c.senderRaw ?? '—'}</span>
                      <span className="truncate font-medium">{c.subject || '(no subject)'}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.lastEventAt ? new Date(c.lastEventAt).toLocaleString('de-DE') : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> {t('app.loading')}
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
