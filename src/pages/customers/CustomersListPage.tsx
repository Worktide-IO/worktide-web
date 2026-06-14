import { useInvalidate, useTable } from '@refinedev/core';
import { Link } from 'react-router';
import { Plus, Search, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { Row } from '@/lib/refine';
import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import { topicFor, useMercureTopic } from '@/lib/mercure';
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
 * First real CRUD page. Lists customers in the active workspace with a
 * status badge, contacts count, and a search-by-name input that drives
 * API Platform's `?name=` partial-match filter.
 *
 * The Refine `useTable` hook wraps TanStack Query and exposes
 * `setFilters` / `setCurrent` / `setPageSize` so we don't have to manage
 * URL params manually — `syncWithLocation: true` in App.tsx makes them
 * round-trip through the URL anyway.
 *
 * Linking to the edit page: each row's `name` cell wraps a react-router
 * <Link to={`/customers/${id}`}>. The /customers/:id route renders the
 * CustomerEditPage; create is at /customers/create.
 */
const STATUS_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  active: 'Aktiv',
  inactive: 'Inaktiv',
  churned: 'Churned',
  archived: 'Archiviert',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  prospect: 'secondary',
  inactive: 'outline',
  churned: 'destructive',
  archived: 'outline',
};

export function CustomersListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { tableQuery, setFilters, setCurrentPage, setPageSize, currentPage, pageSize } = useTable<
    Row<CustomerJsonld>
  >({
    resource: 'customers',
    sorters: { initial: [{ field: 'name', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 25 },
    syncWithLocation: true,
  });

  const applyFilters = (newSearch: string, newStatus: string) => {
    const filters = [];
    if (newSearch) filters.push({ field: 'name', operator: 'contains' as const, value: newSearch });
    if (newStatus !== 'all') filters.push({ field: 'status', operator: 'eq' as const, value: newStatus });
    setFilters(filters, 'replace');
    setCurrentPage(1);
  };

  const isLoading = tableQuery.isLoading;
  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;

  // Live updates via Mercure — subscribe to the customers URI template so
  // every create/update/delete on any customer in the workspace nudges
  // Refine to refetch this list. Cheap (one invalidate per change, the
  // refetch is debounced by TanStack Query's defaults). Voter-protected:
  // even with anonymous Mercure subscriptions, the refetch still goes
  // through the auth provider, so we never display data the user can't
  // see — at worst we waste a single 200/0-row response.
  const invalidate = useInvalidate();
  const { connected: liveConnected } = useMercureTopic(topicFor('customers'), {
    onMessage: useCallback(() => {
      void invalidate({ resource: 'customers', invalidates: ['list'] });
    }, [invalidate]),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">Kunden</h2>
            <LiveBadge connected={liveConnected} />
          </div>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'Kunde' : 'Kunden'} im Workspace
          </p>
        </div>
        <Button asChild>
          <Link to="/customers/create">
            <Plus className="size-4" /> Neuer Kunde
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
                placeholder="Nach Name suchen…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, statusFilter);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                applyFilters(search, v);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="active">Aktiv</SelectItem>
                <SelectItem value="inactive">Inaktiv</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
                <SelectItem value="archived">Archiviert</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              {search || statusFilter !== 'all'
                ? 'Keine Treffer mit diesen Filtern.'
                : 'Noch keine Kunden angelegt.'}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-48">Branche</TableHead>
                    <TableHead className="w-40">Stadt</TableHead>
                    <TableHead className="w-20 text-right">Kontakte</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c['@id']}>
                      <TableCell>
                        <Link
                          to={`/customers/${c.id}`}
                          className="font-medium hover:underline underline-offset-4"
                        >
                          {c.name}
                        </Link>
                        {c.legalName && c.legalName !== c.name ? (
                          <div className="text-xs text-muted-foreground">{c.legalName}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {c.status ? (
                          <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.industry ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{c.city ?? '—'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {c.contacts?.length ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {total > pageSize ? (
                <Pagination
                  total={total}
                  currentPage={currentPage}
                  pageSize={pageSize}
                  onCurrentPage={setCurrentPage}
                  onPageSize={setPageSize}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Pagination({
  total,
  currentPage,
  pageSize,
  onCurrentPage,
  onPageSize,
}: {
  total: number;
  currentPage: number;
  pageSize: number;
  onCurrentPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
      <span>
        {from}–{to} von {total}
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} / Seite
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onCurrentPage(currentPage - 1)}
        >
          Zurück
        </Button>
        <span>
          {currentPage} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= pageCount}
          onClick={() => onCurrentPage(currentPage + 1)}
        >
          Weiter
        </Button>
      </div>
    </div>
  );
}

/**
 * Tiny "live" status pill next to the page title. Green when the Mercure
 * EventSource is open, muted while it reconnects. Kept inline so the
 * Customer list stays a self-contained reference for the pattern; other
 * list pages can copy this exact shape.
 */
function LiveBadge({ connected }: { connected: boolean }) {
  if (connected) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Wifi className="size-3" /> Live
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
      <WifiOff className="size-3" /> offline
    </Badge>
  );
}
