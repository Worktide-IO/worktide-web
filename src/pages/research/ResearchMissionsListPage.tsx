import { useTable } from '@refinedev/core';
import { Compass, Plus, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import {
  MISSION_STATUS_LABEL,
  MISSION_STATUS_VARIANT,
  OBJECTIVE_LABEL,
  type ResearchMissionJsonld,
} from '@/lib/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

/**
 * Research/acquisition missions list. A mission is a stateful agent goal
 * (from a free-text prompt or an accepted proactive suggestion). Searchable by
 * status, row-click opens the mission detail (dialog + leads), "Neue Mission"
 * starts the clarification flow.
 */
export function ResearchMissionsListPage() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<ResearchMissionJsonld>>({
    resource: 'research_missions',
    sorters: { initial: [{ field: 'createdAt', order: 'desc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected } = useLiveResource('research_missions');

  const onStatus = (v: string) => {
    setStatusFilter(v);
    setFilters(v === 'all' ? [] : [{ field: 'status', operator: 'eq', value: v }], 'replace');
    setCurrentPage(1);
  };

  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;
  const isLoading = tableQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">Recherche / Akquise</h2>
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
          <p className="text-sm text-muted-foreground">{total} Missionen im Workspace</p>
        </div>
        <Button asChild>
          <Link to="/research/missions/create">
            <Plus className="size-4" /> Neue Mission
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle className="flex items-center gap-2">
            <Compass className="size-4" /> Missionen
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={onStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Status</SelectItem>
                {Object.entries(MISSION_STATUS_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
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
              {statusFilter !== 'all'
                ? 'Keine Missionen mit diesem Status.'
                : 'Noch keine Missionen. Starte eine neue Recherche.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Auftrag</TableHead>
                  <TableHead className="w-40">Ziel</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-28 text-right">Leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((m) => (
                  <TableRow
                    key={m['@id']}
                    className="cursor-pointer"
                    onClick={() => m.id && navigate(`/research/missions/${m.id}`)}
                  >
                    <TableCell>
                      <div className="font-medium line-clamp-2">{m.prompt}</div>
                      {m.summary ? (
                        <div className="text-xs text-muted-foreground line-clamp-1">{m.summary}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {OBJECTIVE_LABEL[m.objective] ?? m.objective}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={MISSION_STATUS_VARIANT[m.status] ?? 'outline'} className="text-xs">
                        {MISSION_STATUS_LABEL[m.status] ?? m.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {m.foundCount ?? 0}
                      {m.targetCount ? ` / ${m.targetCount}` : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
