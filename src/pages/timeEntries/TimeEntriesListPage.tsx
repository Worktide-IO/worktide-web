import { useGetIdentity, useInvalidate, useList, useTable } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TimeEntryJsonld } from '@/api/types/timeEntry/Jsonld';
import type { TypeOfWorkJsonld } from '@/api/types/typeOfWork/Jsonld';
import type { UserJsonld } from '@/api/types/user/Jsonld';
import { useResilientMutation } from '@/hooks/useResilientMutation';
import { api } from '@/lib/api';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LiveBadge } from '@/components/LiveBadge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { TimeEntryFormDialog } from './TimeEntryFormDialog';
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
  const { t: translate } = useTranslation();
  const [search, setSearch] = useState('');
  const [billableFilter, setBillableFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');

  // Current user → IRI, so the billed-status toggle only renders on
  // the rows this user actually owns. The backend voter + billed-guard
  // listener are the real gate; this just keeps the UI honest.
  const { data: identity } = useGetIdentity<Identity>();
  const myIri = identity?.id ? `/v1/users/${identity.id}` : null;

  const invalidate = useInvalidate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row<TimeEntryJsonld> | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (entry: Row<TimeEntryJsonld>) => {
    setEditing(entry);
    setDialogOpen(true);
  };
  const removeEntry = async (entry: Row<TimeEntryJsonld>) => {
    try {
      await api.delete(`/time_entries/${entry.id}`);
      void invalidate({ resource: 'time_entries', invalidates: ['list'] });
      toast.success(translate('time_entries.deleted'));
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403 ? translate('time_entries.forbidden') : translate('time_entries.delete_failed'),
      );
    }
  };

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
            <h2 className="text-2xl">{translate('time_entries.heading')}</h2>
            <LiveBadge connected={liveConnected} />
          </div>
          <p className="text-sm text-muted-foreground">
            {translate('time_entries.count', { count: total })}
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          {translate('time_entries.new')}
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>{translate('time_entries.overview')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={translate('time_entries.search_placeholder')}
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
                <SelectValue placeholder={translate('time_entries.project')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{translate('time_entries.all_projects')}</SelectItem>
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
                <SelectValue placeholder={translate('time_entries.billable')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{translate('time_entries.all')}</SelectItem>
                <SelectItem value="yes">{translate('time_entries.billable')}</SelectItem>
                <SelectItem value="no">{translate('time_entries.not_billable')}</SelectItem>
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
                ? translate('time_entries.no_matches')
                : translate('time_entries.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{translate('time_entries.col_date')}</TableHead>
                  <TableHead className="w-20 text-right">{translate('time_entries.col_duration')}</TableHead>
                  <TableHead className="w-40">{translate('time_entries.col_person')}</TableHead>
                  <TableHead className="w-44">{translate('time_entries.col_project')}</TableHead>
                  <TableHead className="w-40">{translate('time_entries.col_task')}</TableHead>
                  <TableHead className="w-36">{translate('time_entries.col_activity')}</TableHead>
                  <TableHead>{translate('time_entries.col_note')}</TableHead>
                  <TableHead className="w-24 text-right">{translate('time_entries.col_status')}</TableHead>
                  <TableHead className="w-12" />
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
                            {translate('time_entries.running')}
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
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-8">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">{translate('time_entries.row_actions')}</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              disabled={!!e.running}
                              onClick={() => openEdit(e)}
                            >
                              <Pencil className="size-4" />
                              {translate('time_entries.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => removeEntry(e)}
                            >
                              <Trash2 className="size-4" />
                              {translate('time_entries.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TimeEntryFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        defaultUserIri={myIri}
        projects={projects?.data ?? []}
        tasks={tasks?.data ?? []}
        typesOfWork={typesOfWork?.data ?? []}
        users={users?.data ?? []}
      />
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
  const { t: translate } = useTranslation();
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const { mutate, isPending } = useResilientMutation();

  const editable = isOwn && !entry.running && !entry.isLocked;

  if (!editable) {
    return (
      <div className="flex justify-end gap-1">
        {entry.isBilled ? (
          <Badge variant="secondary" className="text-xs">
            {t('time_entries.billed')}
          </Badge>
        ) : entry.isBillable ? (
          <Badge variant="outline" className="text-xs">
            {t('time_entries.billable_badge')}
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
        label: t('time_entries.billing_status_label'),
      });
      void invalidate({ resource: 'time_entries', invalidates: ['list'] });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? translate('perm.billing_locked')
          : translate('toast.could_not_change_billing_status'),
      );
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-xs text-muted-foreground">{t('time_entries.billed')}</span>
      <Switch
        checked={!!entry.isBilled}
        onCheckedChange={onToggle}
        disabled={isPending}
        aria-label={t('time_entries.toggle_billed_aria')}
      />
    </div>
  );
}

