import { useList } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Building2, Inbox as InboxIcon, Loader2, Mailbox, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import type { ConversationJsonld } from '@/api/types/conversation/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import { TagPicker } from '@/components/TagPicker';
import { topicFor, useMercureTopic } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
import { useKeysetList } from '@/lib/useKeysetList';
import { useUserDirectory, userDisplayName } from '@/hooks/useUserDirectory';
import { MuteRulesManager } from '@/components/MuteRulesManager';
import { LogPhoneCallDialog } from '@/pages/inbox/LogPhoneCallDialog';

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
  // "active" hides muted conversations (2FA noise etc.); "muted" shows only them.
  const [viewFilter, setViewFilter] = useState<string>('active');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const navigate = useNavigate();

  // Debounce subject search to avoid hammering the API on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filters = useMemo(
    () => ({
      status: statusFilter,
      channel: channelFilter,
      'exists[mutedAt]': viewFilter === 'muted' ? 'true' : 'false',
      assignee: assigneeFilter === '__unassigned__' ? '' : assigneeFilter === 'all' ? undefined : assigneeFilter,
      customer: customerFilter ?? undefined,
      'tags.id': tagFilter[0] ?? undefined,
      subject: debouncedSearch || undefined,
    }),
    [statusFilter, channelFilter, viewFilter, assigneeFilter, customerFilter, tagFilter, debouncedSearch],
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

  // Resolve the customer each conversation was auto-linked to at ingest
  // (ContactResolver: sender email → Contact → Customer). Looked up by IRI so
  // it stays correct past the API's 200-customer page cap.
  const customerByIri = useCustomerLookup(items.map((c) => c.customer));

  // User directory for the assignee filter dropdown.
  const { users } = useUserDirectory();

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl flex items-center gap-2">
            <InboxIcon className="size-6 text-muted-foreground" />
            Inbox
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('inbox.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MuteRulesManager />
          <LogPhoneCallDialog />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
          <CardTitle className="text-base">
            {items.length}
            {hasMore ? '+' : ''} {t('inbox.conversations_label', { count: items.length })}
          </CardTitle>
          <div className="ml-auto flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('inbox.search_placeholder')}
                className="h-9 w-48 pl-7 text-sm"
              />
            </div>
            <Select value={viewFilter} onValueChange={setViewFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t('inbox.view_active')}</SelectItem>
                <SelectItem value="muted">{t('inbox.view_muted')}</SelectItem>
              </SelectContent>
            </Select>
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
                {(channels?.data ?? []).filter((c) => !!c['@id']).map((c) => (
                  <SelectItem key={c['@id']} value={c['@id']!}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t('inbox.assignee_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('inbox.all_assignees')}</SelectItem>
                <SelectItem value="__unassigned__">{t('inbox.unassigned')}</SelectItem>
                {users.filter((u) => !!u['@id']).map((u) => (
                  <SelectItem key={u['@id']} value={u['@id']!}>
                    {userDisplayName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <CustomerCombobox
              value={customerFilter}
              onChange={setCustomerFilter}
              placeholder={t('inbox.customer_placeholder')}
              className="h-9 w-48"
            />
            <TagPicker
              value={tagFilter}
              onChange={setTagFilter}
              scope="conversation"
              disableCreate
              placeholder={t('inbox.tag_placeholder')}
              className="h-9"
            />
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
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm">{c.senderRaw ?? '—'}</span>
                        {c.customer && customerByIri[c.customer] ? (
                          <Badge
                            variant="secondary"
                            className="w-fit max-w-full gap-1 text-[10px] font-normal"
                            title={customerByIri[c.customer].name}
                          >
                            <Building2 className="size-2.5 shrink-0" />
                            <span className="truncate">{customerByIri[c.customer].name}</span>
                          </Badge>
                        ) : null}
                      </span>
                      <span className="truncate font-medium">{c.subject || '(no subject)'}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.lastEventAt ? new Date(c.lastEventAt).toLocaleString(intlLocale()) : '—'}
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
