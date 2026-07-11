import { useTable } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckCircle2, Megaphone, Plus, Search, Send, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { POST_STATUS_BADGE, type SocialPostJsonld, type SocialPostStatus } from '@/lib/social';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

/**
 * SocialPost list — "compose once → publish to many". Lives at /social.
 *
 * The body is plain text (no server-side search filter exists), so the
 * text box filters the loaded page client-side; the status dropdown is a
 * real server filter. Network chips + per-target delivery state live in the
 * composer (one click in), keeping this list a single cheap query.
 */
export function SocialPostsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<SocialPostJsonld>>({
    resource: 'social_posts',
    sorters: { initial: [{ field: 'createdAt', order: 'desc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('social_posts');

  const applyStatus = (st: string) => {
    setStatusFilter(st);
    setFilters(
      st === 'all' ? [] : [{ field: 'status', operator: 'eq' as const, value: st }],
      'replace',
    );
    setCurrentPage(1);
  };

  const allRows = tableQuery.data?.data ?? [];
  const rows = search
    ? allRows.filter((r) => (r.body ?? '').toLowerCase().includes(search.toLowerCase()))
    : allRows;
  const total = tableQuery.data?.total ?? 0;
  const isLoading = tableQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="flex items-center gap-2 text-2xl">
              <Megaphone className="size-6 text-muted-foreground" /> Social Posts
            </h2>
            {liveConnected ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Wifi className="size-3" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <WifiOff className="size-3" /> offline
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'Beitrag' : 'Beiträge'} · einmal verfassen, in mehrere Netzwerke
            veröffentlichen
          </p>
        </div>
        <Button asChild>
          <Link to="/social/create">
            <Plus className="size-4" /> Neuer Post
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Übersicht</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Im Text suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={applyStatus}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {(Object.entries(POST_STATUS_BADGE) as [SocialPostStatus, { label: string }][]).map(
                  ([value, b]) => (
                    <SelectItem key={value} value={value}>
                      {t(b.label)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {allRows.length === 0
                ? 'Noch keine Social Posts. Lege deinen ersten Beitrag an.'
                : 'Keine Beiträge passen zur Suche.'}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inhalt</TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead className="w-24 text-center">Netzwerke</TableHead>
                  <TableHead className="w-44">Geplant / veröffentlicht</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const badge = POST_STATUS_BADGE[(p.status ?? 'draft') as SocialPostStatus];
                  return (
                    <TableRow
                      key={p['@id']}
                      className="cursor-pointer"
                      onClick={() => p.id && navigate(`/social/${p.id}`)}
                    >
                      <TableCell className="max-w-md">
                        <span className="line-clamp-2 text-sm">
                          {p.body?.trim() || <span className="italic text-muted-foreground">— leer —</span>}
                        </span>
                      </TableCell>
                      <TableCell>
                        {badge ? (
                          <Badge variant={badge.variant} className="text-[10px]">
                            {t(badge.label)}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-center tabular-nums text-muted-foreground">
                        {p.targets?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.publishedAt ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="size-3 text-emerald-600" />
                            {new Date(p.publishedAt).toLocaleString()}
                          </span>
                        ) : p.scheduledAt ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarClock className="size-3" />
                            {new Date(p.scheduledAt).toLocaleString()}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                            <Send className="size-3" /> nicht geplant
                          </span>
                        )}
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
