import { useList } from '@refinedev/core';
import { Inbox as InboxIcon, Mailbox } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';

const STATUS_LABEL: Record<string, string> = {
  open: 'Offen',
  pending: 'Wartet',
  closed: 'Erledigt',
  spam: 'Spam',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'default',
  pending: 'secondary',
  closed: 'outline',
  spam: 'destructive',
};

/**
 * Top-level Inbox — every conversation across every threading-capable
 * channel for the workspace. Default sort is most-recently-touched.
 *
 * Filter controls are intentionally minimal in the first iteration:
 * status (Open / Pending / Closed / Spam / Alle) and channel. Once we
 * have more channel types in play the channel filter switches to a
 * multi-select.
 *
 * Clicking a row opens the conversation detail at /inbox/<id>.
 */
export function ConversationsListPage() {
  const [statusFilter, setStatusFilter] = useState<string>('open');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const navigate = useNavigate();

  // Live-refresh on Mercure updates so a newly arrived mail bubbles
  // into the list without a manual refresh.
  useLiveResource('conversations');

  const filters = useMemo(() => {
    const fs: Array<{ field: string; operator: 'eq'; value: string }> = [];
    if (statusFilter !== 'all') fs.push({ field: 'status', operator: 'eq', value: statusFilter });
    if (channelFilter !== 'all') fs.push({ field: 'channel', operator: 'eq', value: channelFilter });
    return fs;
  }, [statusFilter, channelFilter]);

  const { result: conversations, query } = useList<Row<ConversationJsonld>>({
    resource: 'conversations',
    pagination: { pageSize: 50 },
    sorters: [{ field: 'lastEventAt', order: 'desc' }],
    filters,
  });

  const { result: channels } = useList<Row<ChannelJsonld>>({
    resource: 'channels',
    pagination: { mode: 'off' },
  });

  const channelByIri = useMemo(() => {
    const m: Record<string, Row<ChannelJsonld>> = {};
    for (const c of channels?.data ?? []) if (c['@id']) m[c['@id']] = c;
    return m;
  }, [channels]);

  const rows = conversations?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl flex items-center gap-2">
            <InboxIcon className="size-6 text-muted-foreground" />
            Inbox
          </h2>
          <p className="text-sm text-muted-foreground">
            Alle eingehenden Konversationen aus Mail-, Slack- und sonstigen Channels.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
          <CardTitle className="text-base">
            {rows.length} Konversation{rows.length === 1 ? '' : 'en'}
          </CardTitle>
          <div className="ml-auto flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="open">Offen</SelectItem>
                <SelectItem value="pending">Wartet</SelectItem>
                <SelectItem value="closed">Erledigt</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
              </SelectContent>
            </Select>
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Channels</SelectItem>
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
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Keine Konversationen — sobald ein Channel Events bringt, erscheinen sie hier.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-44">Channel</TableHead>
                  <TableHead className="w-56">Absender</TableHead>
                  <TableHead>Betreff</TableHead>
                  <TableHead className="w-36">Letzte Aktivität</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const status = (c.status as string) ?? 'open';
                  const ch = c.channel ? channelByIri[c.channel] : null;
                  return (
                    <TableRow
                      key={c['@id']}
                      className="cursor-pointer"
                      onClick={() => c.id && navigate(`/inbox/${c.id}`)}
                    >
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[status] ?? 'outline'} className="text-xs">
                          {STATUS_LABEL[status] ?? status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {ch ? (
                          <span className="inline-flex items-center gap-1">
                            <Mailbox className="size-3" />
                            {ch.name}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-sm truncate max-w-[200px]">
                        {c.senderRaw ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium">{c.subject || '(no subject)'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.lastEventAt ? new Date(c.lastEventAt).toLocaleString('de-DE') : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
