import { useGetIdentity, useInvalidate, useList, useTable } from '@refinedev/core';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TimeEntryJsonld } from '@/api/types/timeEntry/Jsonld';
import type { TypeOfWorkJsonld } from '@/api/types/typeOfWork/Jsonld';
import type { UserJsonld } from '@/api/types/user/Jsonld';
import { useResilientMutation } from '@/hooks/useResilientMutation';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { LiveBadge } from '@/components/LiveBadge';
import { Switch } from '@/components/ui/switch';
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
 * Time entries — flat list ordered by start, newest first.
 *
 * Reporting (group-by-project, group-by-user, weekly totals) lives on
 * the dashboard or in a future Reports page; this view is the raw log
 * an operator scrolls to spot wrong durations, missing project links
 * or non-billable-but-should-be entries.
 *
 * IRI joins follow the same pattern as TasksListPage — one-time fetches
 * of projects, users, tasks and types-of-work (all small workspace
 * tables) feed Map<IRI, entity> lookups in the render loop.
 *
 * Live updates: every TimeEntry create/update/delete now broadcasts on
 * its own Mercure topic, so starting a timer in one tab makes the new
 * row pop in here too — and stopping it updates the duration without
 * a reload.
 */
function formatDuration(minutes: number): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

type Identity = { id?: string };

export function TimeEntriesListPage() {
  const [search, setSearch] = useState('');
  const [billableFilter, setBillableFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  // Current user → IRI, so the billed-status toggle only renders on
  // the rows this user actually owns. The backend voter + billed-guard
  // listener are the real gate; this just keeps the UI honest.
  const { data: identity } = useGetIdentity<Identity>();
  const myIri = identity?.id ? `/v1/users/${identity.id}` : null;

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<TimeEntryJsonld>>({
    resource: 'time_entries',
    sorters: { initial: [{ field: 'startsAt', order: 'desc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('time_entries');

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
  });
  const { result: users } = useList<Row<UserJsonld>>({
    resource: 'users',
    pagination: { mode: 'off' },
  });
  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
  });
  const { result: typesOfWork } = useList<Row<TypeOfWorkJsonld>>({
    resource: 'types_of_work',
    pagination: { mode: 'off' },
  });

  const projectByIri = useMemo<Record<string, Row<ProjectJsonld>>>(() => {
    const map: Record<string, Row<ProjectJsonld>> = {};
    for (const p of projects?.data ?? []) {
      if (p['@id']) map[p['@id']] = p;
    }
    return map;
  }, [projects]);

  const userByIri = useMemo<Record<string, Row<UserJsonld>>>(() => {
    const map: Record<string, Row<UserJsonld>> = {};
    for (const u of users?.data ?? []) {
      if (u['@id']) map[u['@id']] = u;
    }
    return map;
  }, [users]);

  const taskByIri = useMemo<Record<string, Row<TaskJsonld>>>(() => {
    const map: Record<string, Row<TaskJsonld>> = {};
    for (const t of tasks?.data ?? []) {
      if (t['@id']) map[t['@id']] = t;
    }
    return map;
  }, [tasks]);

  const typeByIri = useMemo<Record<string, Row<TypeOfWorkJsonld>>>(() => {
    const map: Record<string, Row<TypeOfWorkJsonld>> = {};
    for (const t of typesOfWork?.data ?? []) {
      if (t['@id']) map[t['@id']] = t;
    }
    return map;
  }, [typesOfWork]);

  const applyFilters = (s: string, billable: string, project: string) => {
    const filters = [];
    if (s) filters.push({ field: 'note', operator: 'contains' as const, value: s });
    if (billable === 'yes')
      filters.push({ field: 'isBillable', operator: 'eq' as const, value: true });
    if (billable === 'no')
      filters.push({ field: 'isBillable', operator: 'eq' as const, value: false });
    if (project !== 'all')
      filters.push({ field: 'project', operator: 'eq' as const, value: project });
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
            <h2 className="text-2xl">Zeiteinträge</h2>
            <LiveBadge connected={liveConnected} />
          </div>
          <p className="text-sm text-muted-foreground">
            {total} Einträge im Workspace
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Übersicht</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="In Notiz suchen…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, billableFilter, projectFilter);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={projectFilter}
              onValueChange={(v) => {
                setProjectFilter(v);
                applyFilters(search, billableFilter, v);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Projekt" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Projekte</SelectItem>
                {(projects?.data ?? []).map((p) => (
                  <SelectItem key={p['@id']} value={p['@id'] ?? ''}>
                    {p.key} · {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={billableFilter}
              onValueChange={(v) => {
                setBillableFilter(v);
                applyFilters(search, v, projectFilter);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Verrechenbar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="yes">Verrechenbar</SelectItem>
                <SelectItem value="no">Nicht verrechenbar</SelectItem>
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
              {search || billableFilter !== 'all' || projectFilter !== 'all'
                ? 'Keine Treffer mit diesen Filtern.'
                : 'Noch keine Zeiteinträge erfasst.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Datum</TableHead>
                  <TableHead className="w-20 text-right">Dauer</TableHead>
                  <TableHead className="w-40">Person</TableHead>
                  <TableHead className="w-44">Projekt</TableHead>
                  <TableHead className="w-40">Aufgabe</TableHead>
                  <TableHead className="w-36">Tätigkeit</TableHead>
                  <TableHead>Notiz</TableHead>
                  <TableHead className="w-24 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => {
                  const project = e.project ? projectByIri[e.project] : null;
                  const task = e.task ? taskByIri[e.task] : null;
                  const user = e.user ? userByIri[e.user] : null;
                  const type = e.typeOfWork ? typeByIri[e.typeOfWork] : null;
                  return (
                    <TableRow key={e['@id']}>
                      <TableCell className="text-xs text-muted-foreground">
                        {e.startsAt
                          ? new Date(e.startsAt).toLocaleString(undefined, {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {e.running ? (
                          <Badge variant="default" className="text-xs">
                            läuft…
                          </Badge>
                        ) : (
                          formatDuration(e.durationMinutes ?? 0)
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {user ? user.fullName || user.email : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project ? (
                          <span>
                            <span className="font-mono text-xs">{project.key}</span>{' '}
                            <span className="text-foreground/70">{project.name}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {task ? (
                          <span>
                            <span className="font-mono">{task.identifier}</span>{' '}
                            <span className="text-foreground/70">{task.title}</span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {type ? (
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={
                              type.color
                                ? { borderColor: type.color, color: type.color }
                                : undefined
                            }
                          >
                            {type.name}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className="text-xs text-muted-foreground truncate max-w-xs"
                        title={e.note ?? undefined}
                      >
                        {e.note ?? ''}
                      </TableCell>
                      <TableCell className="text-right">
                        <BilledCell entry={e} isOwn={!!myIri && e.user === myIri} />
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
 * Status cell for a time entry.
 *
 *  - Own, non-running, non-locked entry → an interactive "abgerechnet"
 *    Switch so the employee can flip the billed status themselves
 *    (awork parity). Backend enforces the `time_entry.toggle_billed_own`
 *    capability; a 403 here means the workspace reserved billing for
 *    admins, so we surface that and leave the switch where it was.
 *  - Everything else → the previous read-only badges.
 *
 * The PATCH goes through useResilientMutation, so a toggle made while
 * offline is queued and replayed on reconnect instead of silently lost.
 */
function BilledCell({ entry, isOwn }: { entry: Row<TimeEntryJsonld>; isOwn: boolean }) {
  const invalidate = useInvalidate();
  const { mutate, isPending } = useResilientMutation();

  const editable = isOwn && !entry.running && !entry.isLocked;

  if (!editable) {
    return (
      <div className="flex justify-end gap-1">
        {entry.isBilled ? (
          <Badge variant="secondary" className="text-xs">
            abgerechnet
          </Badge>
        ) : entry.isBillable ? (
          <Badge variant="outline" className="text-xs">
            verrechenbar
          </Badge>
        ) : null}
      </div>
    );
  }

  const onToggle = async (next: boolean) => {
    try {
      await mutate({
        key: `timeentry-${entry.id}-isbilled`,
        method: 'patch',
        url: `/time_entries/${entry.id}`,
        body: { isBilled: next },
        contentType: 'application/merge-patch+json',
        label: `Abrechnungsstatus für Eintrag`,
      });
      void invalidate({ resource: 'time_entries', invalidates: ['list'] });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? 'Keine Berechtigung — Abrechnungsstatus ist in diesem Workspace gesperrt.'
          : 'Konnte den Abrechnungsstatus nicht ändern.',
      );
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">abgerechnet</span>
      <Switch
        checked={!!entry.isBilled}
        onCheckedChange={onToggle}
        disabled={isPending}
        aria-label="Abrechnungsstatus umschalten"
      />
    </div>
  );
}

