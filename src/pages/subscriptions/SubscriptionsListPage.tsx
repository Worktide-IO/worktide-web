import { useList, useTable } from '@refinedev/core';
import { CalendarDays, Plus, Search, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { CustomerSystemJsonld } from '@/api/types/customerSystem/Jsonld';
import type { ServiceSubscriptionJsonld } from '@/api/types/serviceSubscription/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import { formatMoney } from '@/lib/money';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
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

const BILLING_LABEL: Record<string, string> = {
  monthly: 'Monatlich',
  quarterly: 'Quartal',
  half_yearly: 'Halbjährlich',
  yearly: 'Jährlich',
  once: 'Einmalig',
};

const STATUS_BADGE: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  trial: { label: 'Trial', variant: 'outline' },
  active: { label: 'Aktiv', variant: 'default' },
  paused: { label: 'Pausiert', variant: 'secondary' },
  cancelled: { label: 'Gekündigt', variant: 'destructive' },
};

/**
 * ServiceSubscription list (Wartung / Hosting / Retainer / einmalige
 * Aufträge pro Kunde + ggf. CustomerSystem). Lives at /subscriptions.
 *
 * The price column shows the formatted recurring price; the column to
 * its right shows `nextBillingOn` which the backend auto-recomputes
 * whenever cycle / startedOn / status changes (see CRM-2 in memory).
 * Once-billed subscriptions display "—" because nextBillingOn is null
 * by design for those.
 */
export function SubscriptionsListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<ServiceSubscriptionJsonld>>({
    resource: 'service_subscriptions',
    sorters: { initial: [{ field: 'nextBillingOn', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('service_subscriptions');

  const { result: systems } = useList<Row<CustomerSystemJsonld>>({
    resource: 'customer_systems',
    pagination: { mode: 'off' },
  });

  const systemByIri = useMemo<Record<string, Row<CustomerSystemJsonld>>>(() => {
    const map: Record<string, Row<CustomerSystemJsonld>> = {};
    for (const s of systems?.data ?? []) {
      if (s['@id']) map[s['@id']] = s;
    }
    return map;
  }, [systems]);

  const applyFilters = (s: string, c: string, st: string) => {
    const f = [];
    if (s) f.push({ field: 'name', operator: 'contains' as const, value: s });
    if (c !== 'all') f.push({ field: 'customer', operator: 'eq' as const, value: c });
    if (st !== 'all') f.push({ field: 'status', operator: 'eq' as const, value: st });
    setFilters(f, 'replace');
    setCurrentPage(1);
  };

  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;
  const customerByIri = useCustomerLookup(rows.map((r) => r.customer));
  const isLoading = tableQuery.isLoading;

  // Monthly-equivalent MRR estimate across active subscriptions — quick
  // KPI for the header band; not authoritative for accounting, just a
  // smell-check while scrolling the list.
  const mrrCents = useMemo(() => {
    return rows
      .filter((r) => r.status === 'active')
      .reduce((sum, r) => sum + monthlyEquivalentCents(r), 0);
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">Abos</h2>
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
            {total} Abos · MRR ca. {formatMoney(mrrCents, 'eur')}
          </p>
        </div>
        <Button asChild>
          <Link to="/subscriptions/create">
            <Plus className="size-4" /> Neues Abo
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
                placeholder="Name suchen…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, customerFilter, statusFilter);
                }}
                className="pl-8"
              />
            </div>
            <CustomerCombobox
              className="w-56"
              placeholder="Alle Kunden"
              value={customerFilter === 'all' ? null : customerFilter}
              onChange={(v) => {
                const next = v ?? 'all';
                setCustomerFilter(next);
                applyFilters(search, next, statusFilter);
              }}
            />
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                applyFilters(search, customerFilter, v);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {Object.entries(STATUS_BADGE).map(([value, b]) => (
                  <SelectItem key={value} value={value}>
                    {b.label}
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
              Noch keine Abos angelegt.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-44">Kunde</TableHead>
                  <TableHead className="w-40">System</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-28">Zyklus</TableHead>
                  <TableHead className="w-28 text-right">Preis</TableHead>
                  <TableHead className="w-32">Nächste Abrechnung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const customer = s.customer ? customerByIri[s.customer] : null;
                  const system = s.system ? systemByIri[s.system] : null;
                  const statusBadge = STATUS_BADGE[s.status ?? 'active'];
                  return (
                    <TableRow
                      key={s['@id']}
                      className="cursor-pointer"
                      onClick={() => s.id && navigate(`/subscriptions/${s.id}`)}
                    >
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {system?.name ?? <span className="italic">— Kundenweit —</span>}
                      </TableCell>
                      <TableCell>
                        {statusBadge ? (
                          <Badge variant={statusBadge.variant} className="text-[10px]">
                            {statusBadge.label}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {BILLING_LABEL[s.billingCycle ?? 'monthly'] ?? s.billingCycle}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {formatMoney(s.priceCents ?? 0, s.currency ?? 'eur')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.nextBillingOn ? (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CalendarDays className="size-3" />
                            {new Date(s.nextBillingOn).toLocaleDateString()}
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
 * Rough monthly-revenue projection. Yearly/once aren't strictly "MRR"
 * — once is amortised across a year, yearly divided by 12. Matches the
 * `annualMultiplier()` semantics on the backend BillingCycle enum.
 */
function monthlyEquivalentCents(s: Row<ServiceSubscriptionJsonld>): number {
  const price = s.priceCents ?? 0;
  switch (s.billingCycle) {
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
