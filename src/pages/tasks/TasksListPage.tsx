import { useList, useTable } from '@refinedev/core';
import { Search, Wifi, WifiOff } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { SavedViewsBar } from '@/components/SavedViewsBar';
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
 * Task list — title + status + priority + project + due date in a row.
 *
 * Status and project come back as IRIs in the JSON-LD response, so we
 * fetch the workspace's task-statuses and projects separately (small
 * tables, one-time fetch) and join in the client. Saves us from forcing
 * API Platform to embed those relations and keeps the row payload small
 * enough for the SSE re-broadcasts on every task change.
 *
 * Priority is an enum on the entity — directly rendered as a badge with
 * tide-/coral-tinted variants so "urgent" pops without us needing a
 * second design pass.
 */
const PRIORITY_LABEL = {
  low: 'Niedrig',
  normal: 'Normal',
  high: 'Hoch',
  urgent: 'Dringend',
} as const;

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

export function TasksListPage() {
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { tableQuery, filters, setFilters, setCurrentPage } = useTable<Row<TaskJsonld>>({
    resource: 'tasks',
    sorters: { initial: [{ field: 'updatedAt', order: 'desc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('tasks');

  /**
   * Round-trip saved-view filters through the local search/status/priority
   * state so the inputs reflect what was loaded. Anything Refine doesn't
   * understand (no input bound to it) still applies as a query filter — we
   * just won't render it back in the form, which is fine for v1.
   */
  const applySavedFilters = (next: typeof filters) => {
    setFilters(next as never, 'replace');
    setCurrentPage(1);
    let nextSearch = '';
    let nextStatus = 'all';
    let nextPrio = 'all';
    for (const f of next) {
      if ('field' in f && typeof f.value === 'string') {
        if (f.field === 'title') nextSearch = f.value;
        if (f.field === 'status') nextStatus = f.value;
        if (f.field === 'priority') nextPrio = f.value;
      }
    }
    setSearch(nextSearch);
    setStatusFilter(nextStatus);
    setPriorityFilter(nextPrio);
  };

  // One-time lookups for IRI → human-readable joins. `pagination.mode:off`
  // pulls every row in a single request; both tables are small.
  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
  });
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
  });

  const statusByIri = useMemo<Record<string, Row<TaskStatusJsonld>>>(() => {
    const map: Record<string, Row<TaskStatusJsonld>> = {};
    for (const s of statuses?.data ?? []) {
      if (s['@id']) map[s['@id']] = s;
    }
    return map;
  }, [statuses]);

  const projectByIri = useMemo<Record<string, Row<ProjectJsonld>>>(() => {
    const map: Record<string, Row<ProjectJsonld>> = {};
    for (const p of projects?.data ?? []) {
      if (p['@id']) map[p['@id']] = p;
    }
    return map;
  }, [projects]);

  const applyFilters = (s: string, status: string, prio: string) => {
    const filters = [];
    if (s) filters.push({ field: 'title', operator: 'contains' as const, value: s });
    if (status !== 'all') filters.push({ field: 'status', operator: 'eq' as const, value: status });
    if (prio !== 'all') filters.push({ field: 'priority', operator: 'eq' as const, value: prio });
    setFilters(filters, 'replace');
    setCurrentPage(1);
  };

  const isLoading = tableQuery.isLoading;
  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">Aufgaben</h2>
            <LiveBadge connected={liveConnected} />
          </div>
          <p className="text-sm text-muted-foreground">
            {total} Aufgaben im Workspace
          </p>
        </div>
        <SavedViewsBar currentFilters={filters} onApply={applySavedFilters} />
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Übersicht</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Im Titel suchen…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, statusFilter, priorityFilter);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                applyFilters(search, v, priorityFilter);
              }}
            >
              <SelectTrigger className="w-48">
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
            <Select
              value={priorityFilter}
              onValueChange={(v) => {
                setPriorityFilter(v);
                applyFilters(search, statusFilter, v);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priorität" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Prios</SelectItem>
                <SelectItem value="low">Niedrig</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">Hoch</SelectItem>
                <SelectItem value="urgent">Dringend</SelectItem>
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
              {search || statusFilter !== 'all' || priorityFilter !== 'all'
                ? 'Keine Treffer mit diesen Filtern.'
                : 'Noch keine Aufgaben angelegt.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead>Titel</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-28">Prio</TableHead>
                  <TableHead className="w-44">Projekt</TableHead>
                  <TableHead className="w-32">Fällig</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const status = t.status ? statusByIri[t.status] : null;
                  const project = t.project ? projectByIri[t.project] : null;
                  return (
                    <TableRow key={t['@id']}>
                      <TableCell className="font-mono text-xs">{t.identifier}</TableCell>
                      <TableCell className="font-medium">{t.title}</TableCell>
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
                      <TableCell>
                        {t.priority ? (
                          <Badge
                            variant={PRIORITY_VARIANT[t.priority] ?? 'outline'}
                            className="text-xs"
                          >
                            {PRIORITY_LABEL[t.priority]}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project ? (
                          <span>
                            <span className="font-mono text-xs">{project.key}</span>{' '}
                            <span className="text-foreground/70">{project.name}</span>
                          </span>
                        ) : (
                          '— Privat —'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t.dueOn ? new Date(t.dueOn).toLocaleDateString() : '—'}
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
