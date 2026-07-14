import { useList, useTable } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Wifi, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';

import { useLiveResource } from '@/lib/mercure';
import { formatMoney } from '@/lib/money';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import type { Row } from '@/lib/refine';
import {
  SERVICE_ASSIGNMENT_STATUS_BADGE,
  SERVICE_BILLING_LABEL,
  type ServiceAssignmentJsonld,
  type ServiceJsonld,
  type ServiceVersionJsonld,
} from '@/lib/services';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
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
import { useState } from 'react';

/**
 * Service assignments list (which customer runs which ServiceVersion, at
 * what price/cycle). Lives at /subscriptions ("Abos"). Assignments are
 * created + edited from the customer detail "Abos" tab — this page is a
 * read-only cross-customer overview with a monthly-equivalent MRR KPI.
 *
 * The price column shows the assignment's effective price (override or the
 * version's net price); the next column shows `nextBillingOn` which the
 * backend auto-recomputes. Once-billed assignments show "—".
 */
export function SubscriptionsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<ServiceAssignmentJsonld>>({
    resource: 'service_assignments',
    sorters: { initial: [{ field: 'nextBillingOn', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('service_assignments');

  const { result: services } = useList<Row<ServiceJsonld>>({
    resource: 'services',
    pagination: { mode: 'off' },
  });
  const { result: versions } = useList<Row<ServiceVersionJsonld>>({
    resource: 'service_versions',
    pagination: { mode: 'off' },
  });

  const serviceByIri = useMemo(() => {
    const m: Record<string, Row<ServiceJsonld>> = {};
    for (const s of services?.data ?? []) if (s['@id']) m[s['@id']] = s;
    return m;
  }, [services]);
  const versionByIri = useMemo(() => {
    const m: Record<string, Row<ServiceVersionJsonld>> = {};
    for (const v of versions?.data ?? []) if (v['@id']) m[v['@id']] = v;
    return m;
  }, [versions]);

  const applyFilters = (c: string, st: string) => {
    const f = [];
    if (c !== 'all') f.push({ field: 'customer', operator: 'eq' as const, value: c });
    if (st !== 'all') f.push({ field: 'status', operator: 'eq' as const, value: st });
    setFilters(f, 'replace');
    setCurrentPage(1);
  };

  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;
  const customerByIri = useCustomerLookup(rows.map((r) => r.customer));
  const isLoading = tableQuery.isLoading;

  // Monthly-equivalent MRR estimate across active assignments — quick KPI
  // for the header band; not authoritative for accounting.
  const mrrCents = useMemo(() => {
    return rows
      .filter((r) => r.status === 'active')
      .reduce((sum, r) => {
        const version = r.serviceVersion ? versionByIri[r.serviceVersion] : undefined;
        return sum + monthlyEquivalentCents(r.effectivePriceCents ?? 0, version?.billingCycle);
      }, 0);
  }, [rows, versionByIri]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">{t('subscriptions_list.heading')}</h2>
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
            {t('subscriptions_list.summary', { count: total, mrr: formatMoney(mrrCents, 'eur') })}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>{t('subscriptions_list.overview')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <CustomerCombobox
              className="w-56"
              placeholder={t('subscriptions_list.all_customers')}
              value={customerFilter === 'all' ? null : customerFilter}
              onChange={(v) => {
                const next = v ?? 'all';
                setCustomerFilter(next);
                applyFilters(next, statusFilter);
              }}
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                applyFilters(customerFilter, v);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('subscriptions_list.status_placeholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('subscriptions_list.all_status')}</SelectItem>
                {Object.entries(SERVICE_ASSIGNMENT_STATUS_BADGE).map(([value, b]) => (
                  <SelectItem key={value} value={value}>
                    {t(b.label)}
                  </SelectItem>
                ))}
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
            <p className="text-center text-sm text-muted-foreground py-12">
              {t('subscriptions_list.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t('subscriptions_list.col_customer')}</TableHead>
                  <TableHead>{t('subscriptions_list.col_service')}</TableHead>
                  <TableHead className="w-32">{t('subscriptions_list.col_status')}</TableHead>
                  <TableHead className="w-28">{t('subscriptions_list.col_cycle')}</TableHead>
                  <TableHead className="w-28 text-right">
                    {t('subscriptions_list.col_price')}
                  </TableHead>
                  <TableHead className="w-32">{t('subscriptions_list.col_next_billing')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sa) => {
                  const customer = sa.customer ? customerByIri[sa.customer] : null;
                  const version = sa.serviceVersion ? versionByIri[sa.serviceVersion] : undefined;
                  const service = version?.service ? serviceByIri[version.service] : undefined;
                  const statusBadge =
                    SERVICE_ASSIGNMENT_STATUS_BADGE[sa.status ?? 'active'];
                  const customerId = sa.customer?.split('/').pop();
                  return (
                    <TableRow
                      key={sa['@id']}
                      className={customerId ? 'cursor-pointer' : undefined}
                      onClick={() =>
                        customerId && navigate(`/customers/${customerId}?tab=subscriptions`)
                      }
                    >
                      <TableCell className="text-muted-foreground">
                        {customer?.name ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium">{service?.name ?? '—'}</TableCell>
                      <TableCell>
                        {statusBadge ? (
                          <Badge variant={statusBadge.variant} className="text-[10px]">
                            {t(statusBadge.label)}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {version?.billingCycle
                          ? t(SERVICE_BILLING_LABEL[version.billingCycle])
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(sa.effectivePriceCents ?? 0, version?.currency ?? 'eur')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {sa.nextBillingOn ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CalendarDays className="size-3" />
                            {new Date(sa.nextBillingOn).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60">—</span>
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

/**
 * Rough monthly-revenue projection. Yearly/once aren't strictly "MRR" —
 * once is amortised across a year, yearly divided by 12. Matches the
 * `annualMultiplier()` semantics on the backend BillingCycle enum.
 */
function monthlyEquivalentCents(price: number, cycle: string | undefined): number {
  switch (cycle) {
    case 'monthly':
      return price;
    case 'quarterly':
      return price / 3;
    case 'half_yearly':
      return price / 6;
    case 'yearly':
      return price / 12;
    case 'once':
      return price / 12;
    default:
      return price;
  }
}
