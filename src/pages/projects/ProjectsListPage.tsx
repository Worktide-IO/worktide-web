import { useList, useTable } from '@refinedev/core';
import { Search, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { ProjectStatusJsonld } from '@/api/types/projectStatus/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
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
 * Projects list mirroring the Tasks pattern — `status` and `customer`
 * IRIs are resolved client-side via separate one-time fetches of the
 * workspace's project-statuses and customers. Both lookup tables are
 * small (<100 rows in any realistic workspace), so the extra requests
 * are negligible against the upside of human-readable badges.
 *
 * The DashboardPage that used to live at /projects is kept for the
 * landing / "/" route where it acts as a workspace overview; this page
 * owns the full filter+pagination experience.
 */
export function ProjectsListPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<ProjectJsonld>>({
    resource: 'projects',
    sorters: { initial: [{ field: 'updatedAt', order: 'desc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('projects');

  const { result: statuses } = useList<Row<ProjectStatusJsonld>>({
    resource: 'project_statuses',
    pagination: { mode: 'off' },
  });
  const { result: customers } = useList<Row<CustomerJsonld>>({
    resource: 'customers',
    pagination: { mode: 'off' },
  });

  const statusByIri = useMemo<Record<string, Row<ProjectStatusJsonld>>>(() => {
    const map: Record<string, Row<ProjectStatusJsonld>> = {};
    for (const s of statuses?.data ?? []) {
      if (s['@id']) map[s['@id']] = s;
    }
    return map;
  }, [statuses]);

  const customerByIri = useMemo<Record<string, Row<CustomerJsonld>>>(() => {
    const map: Record<string, Row<CustomerJsonld>> = {};
    for (const c of customers?.data ?? []) {
      if (c['@id']) map[c['@id']] = c;
    }
    return map;
  }, [customers]);

  const applyFilters = (s: string, status: string) => {
    const filters = [];
    if (s) filters.push({ field: 'name', operator: 'contains' as const, value: s });
    if (status !== 'all') filters.push({ field: 'status', operator: 'eq' as const, value: status });
    setFilters(filters, 'replace');
    setCurrentPage(1);
  };

  const isLoading = tableQuery.isLoading;
  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">Projekte</h2>
            <LiveBadge connected={liveConnected} />
          </div>
          <p className="text-sm text-muted-foreground">{total} Projekte im Workspace</p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Übersicht</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Im Namen suchen…"
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
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {(statuses?.data ?? []).map((s) => (
                  <SelectItem key={s['@id']} value={s['@id'] ?? ''}>
                    {s.name}
                  </SelectItem>
                ))}
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
                : 'Noch keine Projekte angelegt.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Key</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead className="w-56">Kunde</TableHead>
                  <TableHead className="w-32 text-right">Aktualisiert</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const status = p.status ? statusByIri[p.status] : null;
                  const customer = p.customer ? customerByIri[p.customer] : null;
                  return (
                    <TableRow key={p['@id']}>
                      <TableCell className="font-mono text-xs">{p.key}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>
                        {status ? (
                          <Badge
                            variant={status.isCompleted ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {status.name}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer ? customer.name : '— Intern —'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—'}
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

function LiveBadge({ connected }: { connected: boolean }) {
  return connected ? (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Wifi className="size-3" /> Live
    </Badge>
  ) : (
    <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
      <WifiOff className="size-3" /> offline
    </Badge>
  );
}
