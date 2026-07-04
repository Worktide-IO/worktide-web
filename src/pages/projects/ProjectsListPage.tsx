import { useList, useTable } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckSquare, Plus, Search, Timer, Wifi, WifiOff } from 'lucide-react';
import { ProjectStarButton } from '@/components/ProjectStarButton';
import { TagChips } from '@/components/TagChips';
import { TagPicker } from '@/components/TagPicker';
import { UserAvatarStack } from '@/components/UserAvatarStack';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { ProjectMemberJsonld } from '@/api/types/projectMember/Jsonld';
import type { ProjectStatusJsonld } from '@/api/types/projectStatus/Jsonld';
import { api } from '@/lib/api';
import { useLiveResource } from '@/lib/mercure';
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
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string[]>([]);

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
  const statusByIri = useMemo<Record<string, Row<ProjectStatusJsonld>>>(() => {
    const map: Record<string, Row<ProjectStatusJsonld>> = {};
    for (const s of statuses?.data ?? []) {
      if (s['@id']) map[s['@id']] = s;
    }
    return map;
  }, [statuses]);

  // Aggregates that drive the new columns. Three single requests vs
  // per-row fetches:
  //  - All tasks in the workspace → group by project for counts.
  //  - /v1/reports/time over the last year, groupBy=project → minutes
  //    per project IRI.
  //  - All project_members → user-IRI lists per project.
  // Open-task counts per project come from one grouped aggregate endpoint
  // instead of fetching every open task in the workspace just to tally them.
  const { data: openTasksByProject } = useQuery({
    queryKey: ['open-task-counts'],
    queryFn: async () => {
      const { data } = await api.get<{ counts: Record<string, number> }>('/reports/open-task-counts');
      return data.counts;
    },
    staleTime: 60_000,
  });

  const { data: hoursPerProject } = useQuery({
    queryKey: ['projects-hours'],
    queryFn: async () => {
      const from = new Date();
      from.setFullYear(from.getFullYear() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 1);
      const { data } = await api.get<{
        groups: { key: string; minutes: number }[];
      }>('/reports/time', {
        params: { from: from.toISOString(), to: to.toISOString(), groupBy: 'project' },
      });
      const map: Record<string, number> = {};
      for (const g of data.groups ?? []) {
        if (g.key) map[g.key] = g.minutes;
      }
      return map;
    },
    staleTime: 60_000,
  });

  const { result: projectMembers } = useList<Row<ProjectMemberJsonld>>({
    resource: 'project_members',
    pagination: { mode: 'off' },
  });

  const membersByProject = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const m of projectMembers?.data ?? []) {
      if (m.project && m.user) (map[m.project] ??= []).push(m.user);
    }
    return map;
  }, [projectMembers]);

  const applyFilters = (s: string, status: string, tags: string[]) => {
    const filters = [];
    if (s) filters.push({ field: 'name', operator: 'contains' as const, value: s });
    if (status !== 'all') filters.push({ field: 'status', operator: 'eq' as const, value: status });
    if (tags.length > 0) {
      filters.push({ field: 'tags', operator: 'eq' as const, value: tags.join(',') });
    }
    setFilters(filters, 'replace');
    setCurrentPage(1);
  };

  const isLoading = tableQuery.isLoading;
  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;
  const customerByIri = useCustomerLookup(rows.map((p) => p.customer));

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
        <Button onClick={() => navigate('/projects/create')}>
          <Plus className="size-4" /> Neues Projekt
        </Button>
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
                  applyFilters(e.target.value, statusFilter, tagFilter);
                }}
                className="pl-8"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v);
                applyFilters(search, v, tagFilter);
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
            <TagPicker
              value={tagFilter}
              onChange={(next) => {
                setTagFilter(next);
                applyFilters(search, statusFilter, next);
              }}
              scope="project"
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
              {search || statusFilter !== 'all'
                ? 'Keine Treffer mit diesen Filtern.'
                : 'Noch keine Projekte angelegt.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" aria-label="Favorit" />
                  <TableHead className="w-24">Key</TableHead>
                  <TableHead className="w-28">Nummer</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-48">Kunde</TableHead>
                  <TableHead className="w-24 text-right">Fällig</TableHead>
                  <TableHead className="w-20 text-right">Tasks</TableHead>
                  <TableHead className="w-24 text-right">Aufwand</TableHead>
                  <TableHead className="w-32">Team</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const status = p.status ? statusByIri[p.status] : null;
                  const customer = p.customer ? customerByIri[p.customer] : null;
                  return (
                    <TableRow
                      key={p['@id']}
                      className="cursor-pointer"
                      onClick={() => p.id && navigate(`/projects/${p.id}`)}
                    >
                      <TableCell className="p-1 text-center">
                        <ProjectStarButton projectId={p.id} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.key}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {(p as { number?: string | null }).number ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="space-y-1">
                          <div>{p.name}</div>
                          {p.tags && p.tags.length > 0 ? (
                            <TagChips iris={p.tags} size="sm" max={5} />
                          ) : null}
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
                      <TableCell className="text-muted-foreground">
                        {customer ? customer.name : '— Intern —'}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {p.dueOn ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="size-3" />
                            {new Date(p.dueOn).toLocaleDateString()}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {p['@id'] && openTasksByProject?.[p['@id']] ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckSquare className="size-3 text-muted-foreground" />
                            {openTasksByProject[p['@id']]}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {p.id && hoursPerProject?.[p.id] ? (
                          <span className="inline-flex items-center gap-1">
                            <Timer className="size-3 text-muted-foreground" />
                            {Math.round((hoursPerProject[p.id] / 60) * 10) / 10} h
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <UserAvatarStack
                          iris={(p['@id'] ? membersByProject[p['@id']] : null) ?? []}
                          size="sm"
                          max={3}
                        />
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
