import { useList, useTable } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { EntitySyncJsonld } from '@/api/types/entitySync/Jsonld';
import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { api } from '@/lib/api';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { BulkActionsBar } from '@/components/BulkActionsBar';
import { SavedViewsBar } from '@/components/SavedViewsBar';
import { EntitySyncBadgeStack } from '@/components/EntitySyncBadgeStack';
import { LiveBadge } from '@/components/LiveBadge';
import { PriorityScoreBadge, scoreEntryFromTask } from '@/components/PriorityScoreBadge';
import { TagPicker } from '@/components/TagPicker';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { TrackerChip } from '@/components/TrackerChip';
import { useTrackers } from '@/hooks/useTrackers';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
  low: 'priority.low',
  normal: 'priority.normal',
  high: 'priority.high',
  urgent: 'priority.urgent',
} as const;

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'priority.low',
  normal: 'priority.normal',
  high: 'priority.high',
  urgent: 'priority.urgent',
};

export function TasksListPage() {
  const { t: translate } = useTranslation();
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);

  const { tableQuery, filters, setFilters, setCurrentPage, sorters, setSorters } = useTable<Row<TaskJsonld>>({
    resource: 'tasks',
    sorters: { initial: [{ field: 'updatedAt', order: 'desc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });

  // Server-side sort toggle for the computed score column (spans all pages).
  const scoreSort = sorters.find((s) => s.field === 'priorityScore')?.order;
  const toggleScoreSort = () => {
    const next = scoreSort === 'desc' ? 'asc' : 'desc';
    setSorters([{ field: 'priorityScore', order: next }]);
    setCurrentPage(1);
  };
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
  const { byIri: trackerByIri } = useTrackers();

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

  const applyFilters = (s: string, status: string, prio: string, tags: string[]) => {
    const filters = [];
    if (s) filters.push({ field: 'title', operator: 'contains' as const, value: s });
    if (status !== 'all') filters.push({ field: 'status', operator: 'eq' as const, value: status });
    if (prio !== 'all') filters.push({ field: 'priority', operator: 'eq' as const, value: prio });
    if (tags.length > 0) {
      // SearchFilter on a ManyToMany with multiple values accepts a
      // comma-separated list ("OR"); workspace IRIs go through verbatim.
      filters.push({ field: 'tags', operator: 'eq' as const, value: tags.join(',') });
    }
    setFilters(filters, 'replace');
    setCurrentPage(1);
  };

  const isLoading = tableQuery.isLoading;
  const rows = useMemo(() => tableQuery.data?.data ?? [], [tableQuery.data]);
  const total = tableQuery.data?.total ?? 0;

  // External-sync badges: fetch ONLY the syncs for the tasks on this page in a
  // single request, instead of letting each row's EntitySyncBadgeStack crawl the
  // whole workspace entity_syncs table (pagination:off = dozens of round-trips).
  const pageTaskIds = useMemo(
    () => rows.map((r) => r.id).filter((id): id is string => Boolean(id)),
    [rows],
  );
  const { data: pageSyncs } = useQuery({
    queryKey: ['task-entity-syncs', pageTaskIds],
    enabled: pageTaskIds.length > 0,
    queryFn: async () => {
      const search = new URLSearchParams();
      search.set('entityType', 'task');
      for (const id of pageTaskIds) search.append('entityId[]', id);
      // One page covers a 50-row list comfortably (200 = API max per page).
      search.set('itemsPerPage', '200');
      const { data } = await api.get(`/entity_syncs?${search.toString()}`);
      return (data.member ?? data['hydra:member'] ?? []) as Row<EntitySyncJsonld>[];
    },
  });
  const syncsByTaskId = useMemo(() => {
    const map: Record<string, Row<EntitySyncJsonld>[]> = {};
    for (const s of pageSyncs ?? []) {
      if (!s.entityId) continue;
      (map[s.entityId] ??= []).push(s);
    }
    return map;
  }, [pageSyncs]);

  // Bulk-edit selection state — set of task IRIs.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const allSelected = rows.length > 0 && rows.every((r) => r['@id'] && selected.has(r['@id']));
  const someSelected = rows.some((r) => r['@id'] && selected.has(r['@id']));

  const toggleOne = (iri: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(iri);
      else next.delete(iri);
      return next;
    });
  };
  const togglePage = (checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (!r['@id']) continue;
        if (checked) next.add(r['@id']);
        else next.delete(r['@id']);
      }
      return next;
    });
  };

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
                  applyFilters(e.target.value, statusFilter, priorityFilter, tagFilter);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                applyFilters(search, v, priorityFilter, tagFilter);
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
                applyFilters(search, statusFilter, v, tagFilter);
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
            <TagPicker
              value={tagFilter}
              onChange={(next) => {
                setTagFilter(next);
                applyFilters(search, statusFilter, priorityFilter, next);
              }}
              scope="task"
              disableCreate
              placeholder="Nach Tags filtern…"
            />
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allSelected ? true : someSelected ? 'indeterminate' : false
                      }
                      onCheckedChange={(v) => togglePage(v === true)}
                      aria-label="Alle auf dieser Seite auswählen"
                    />
                  </TableHead>
                  <TableHead className="w-24">ID</TableHead>
                  <TableHead className="w-8" />
                  <TableHead>Titel</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-28">Prio</TableHead>
                  <TableHead className="w-24">
                    <button
                      type="button"
                      onClick={toggleScoreSort}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      title="Nach Prioritäts-Score sortieren"
                    >
                      Score
                      {scoreSort === 'desc' ? (
                        <ArrowDown className="size-3" />
                      ) : scoreSort === 'asc' ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowUpDown className="size-3 opacity-50" />
                      )}
                    </button>
                  </TableHead>
                  <TableHead className="w-44">Projekt</TableHead>
                  <TableHead className="w-32">Fällig</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const status = t.status ? statusByIri[t.status] : null;
                  const project = t.project ? projectByIri[t.project] : null;
                  const tracker = t.tracker ? trackerByIri[t.tracker] : null;
                  const iri = t['@id'] ?? '';
                  const isChecked = selected.has(iri);
                  return (
                    <TableRow
                      key={t['@id']}
                      data-state={isChecked ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={(e) => {
                        // Clicking the checkbox shouldn't open the sheet.
                        const target = e.target as HTMLElement;
                        if (target.closest('[role=checkbox]') || target.tagName === 'INPUT') return;
                        if (t.id) setOpenTaskId(t.id);
                      }}
                    >
                      <TableCell>
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(v) => toggleOne(iri, v === true)}
                          aria-label="Diesen Task auswählen"
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.identifier}</TableCell>
                      <TableCell className="p-0 pr-2">
                        <TrackerChip tracker={tracker} variant="icon" />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{t.title}</span>
                          <EntitySyncBadgeStack
                            entityId={t.id}
                            syncs={t.id ? (syncsByTaskId[t.id] ?? []) : []}
                            variant="compact"
                          />
                        </div>
                      </TableCell>
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
                            {translate(PRIORITY_LABEL[t.priority])}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <PriorityScoreBadge entry={scoreEntryFromTask(t)} />
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

      <BulkActionsBar
        selectedIris={Array.from(selected)}
        onClear={() => setSelected(new Set())}
      />

      <TaskDetailSheet
        taskId={openTaskId}
        onOpenChange={(o) => !o && setOpenTaskId(null)}
      />
    </div>
  );
}

