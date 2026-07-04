import { useTable } from '@refinedev/core';
import { Search, Target, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';

import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import {
  LEAD_STAGE_LABEL,
  LEAD_STAGES,
  type LeadJsonld,
} from '@/lib/research';
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
import { LeadsTable } from './LeadsTable';

/**
 * Workspace-wide leads pipeline (across all missions). Searchable by name and
 * filterable by stage; stage changes + convert-to-customer happen inline via
 * the shared {@link LeadsTable}.
 */
export function LeadsListPage() {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<LeadJsonld>>({
    resource: 'leads',
    sorters: { initial: [{ field: 'fitScore', order: 'desc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected } = useLiveResource('leads');

  const applyFilters = (s: string, stage: string) => {
    const f = [];
    if (s) f.push({ field: 'name', operator: 'contains' as const, value: s });
    if (stage !== 'all') f.push({ field: 'stage', operator: 'eq' as const, value: stage });
    setFilters(f, 'replace');
    setCurrentPage(1);
  };

  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;
  const isLoading = tableQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl">Leads</h2>
        {connected ? (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Wifi className="size-3" /> Live
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <WifiOff className="size-3" /> offline
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{total} Leads im Workspace</p>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4" /> Pipeline
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Name suchen…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, stageFilter);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={stageFilter}
              onValueChange={(v) => {
                setStageFilter(v);
                applyFilters(search, v);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Stufen</SelectItem>
                {LEAD_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {LEAD_STAGE_LABEL[s]}
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
          ) : (
            <LeadsTable leads={rows} onChanged={() => void tableQuery.refetch()} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
