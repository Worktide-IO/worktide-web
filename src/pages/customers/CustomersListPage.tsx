import { useList, useTable } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { Row } from '@/lib/refine';
import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { IndustryJsonld } from '@/lib/industry';
import { useLiveResource } from '@/lib/mercure';
import { Badge } from '@/components/ui/badge';
import { LiveBadge } from '@/components/LiveBadge';
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
  prospect: 'customer_status.prospect',
  active: 'customer_status.active',
  inactive: 'customer_status.inactive',
  churned: 'customer_status.churned',
  archived: 'customer_status.archived',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  prospect: 'secondary',
  inactive: 'outline',
  churned: 'destructive',
  archived: 'outline',
};

/** Widen the (stale) generated Customer type with the relationship-type flags. */
type CustomerRow = Row<CustomerJsonld> & { isCustomer?: boolean; isVendor?: boolean };

export function CustomersListPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { tableQuery, setFilters, setCurrentPage, setPageSize, currentPage, pageSize } = useTable<
    Row<CustomerJsonld>
  >({
    resource: 'customers',
    sorters: { initial: [{ field: 'name', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 25 },
    syncWithLocation: true,
  });

  // Resolve the industry relation (IRI) to its name for display.
  const { result: industries } = useList<Row<IndustryJsonld>>({
    resource: 'industries',
    pagination: { mode: 'off' },
  });
  const industryByIri = useMemo(() => {
    const m: Record<string, string> = {};
    for (const i of industries?.data ?? []) if (i['@id']) m[i['@id']] = i.name;
    return m;
  }, [industries]);

  const applyFilters = (newSearch: string, newStatus: string, newType: string) => {
    const filters = [];
    if (newSearch) filters.push({ field: 'name', operator: 'contains' as const, value: newSearch });
    if (newStatus !== 'all') filters.push({ field: 'status', operator: 'eq' as const, value: newStatus });
    if (newType === 'customer') filters.push({ field: 'isCustomer', operator: 'eq' as const, value: true });
    if (newType === 'vendor') filters.push({ field: 'isVendor', operator: 'eq' as const, value: true });
    setFilters(filters, 'replace');
    setCurrentPage(1);
  };

  const isLoading = tableQuery.isLoading;
  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;

  // Live updates via Mercure — the helper subscribes to the customers
  // URI template + invalidates this list on any frame. Voter protection
  // at the API layer means anonymous (or off-tenant) Mercure messages
  // never leak data; the worst case is a wasted refetch.
  const { connected: liveConnected } = useLiveResource('customers');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">{t('customers_list.heading')}</h2>
            <LiveBadge connected={liveConnected} />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('customers_list.count', { count: total })}
          </p>
        </div>
        <Button asChild>
          <Link to="/customers/create">
            <Plus className="size-4" /> {t('customers_list.new')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>{t('customers_list.overview')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t('customers_list.search_ph')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, statusFilter, typeFilter);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                applyFilters(search, statusFilter, v);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('customers_list.type_all')}</SelectItem>
                <SelectItem value="customer">{t('customers_list.type_customer')}</SelectItem>
                <SelectItem value="vendor">{t('customers_list.type_vendor')}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                applyFilters(search, v, typeFilter);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('customers_list.status_all')}</SelectItem>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="active">{t('customers_list.status_active')}</SelectItem>
                <SelectItem value="inactive">{t('customers_list.status_inactive')}</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
                <SelectItem value="archived">{t('customers_list.status_archived')}</SelectItem>
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
                ? t('customers_list.empty_filtered')
                : t('customers_list.empty')}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('customers_list.col_name')}</TableHead>
                    <TableHead className="w-28">{t('customers_list.col_type')}</TableHead>
                    <TableHead className="w-32">{t('customers_list.col_status')}</TableHead>
                    <TableHead className="w-48">{t('customers_list.col_industry')}</TableHead>
                    <TableHead className="w-40">{t('customers_list.col_city')}</TableHead>
                    <TableHead className="w-20 text-right">{t('customers_list.col_contacts')}</TableHead>
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
                        <div className="flex flex-wrap gap-1">
                          {(c as CustomerRow).isCustomer ? (
                            <Badge variant="secondary">{t('customers_list.type_customer')}</Badge>
                          ) : null}
                          {(c as CustomerRow).isVendor ? (
                            <Badge variant="outline">{t('customers_list.type_vendor')}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {c.status ? (
                          <Badge variant={STATUS_VARIANT[c.status] ?? 'outline'}>
                            {STATUS_LABEL[c.status] ? t(STATUS_LABEL[c.status]) : c.status}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.industry ? (industryByIri[c.industry] ?? '—') : '—'}</TableCell>
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
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
      <span>
        {t('customers_list.pagination_range', { from, to, total })}
      </span>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50, 100].map((s) => (
              <SelectItem key={s} value={String(s)}>
                {t('customers_list.per_page', { n: s })}
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
          {t('customers_list.prev')}
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
          {t('customers_list.next')}
        </Button>
      </div>
    </div>
  );
}

