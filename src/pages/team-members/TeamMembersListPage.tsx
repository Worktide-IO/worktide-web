import { useList } from '@refinedev/core';
import { CheckSquare, Crown, Mail, Search, ShieldCheck, UserCog } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { WorkspaceMemberJsonld } from '@/api/types/workspaceMember/Jsonld';
import { InviteMembersCard } from '@/components/InviteMembersCard';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserDirectory, userDisplayName, userInitials } from '@/hooks/useUserDirectory';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<string, { label: string; icon: typeof Crown; tone: string }> = {
  owner: { label: 'Owner', icon: Crown, tone: 'text-amber-600 bg-amber-100 border-amber-200' },
  admin: { label: 'Admin', icon: ShieldCheck, tone: 'text-violet-600 bg-violet-100 border-violet-200' },
  member: { label: 'Member', icon: UserCog, tone: 'text-slate-600 bg-slate-100 border-slate-200' },
  guest: { label: 'Gast', icon: UserCog, tone: 'text-slate-500 bg-slate-50 border-slate-200' },
};

/**
 * Personen page — workspace-Mitglieder als Card-Grid. Pro Person:
 * Avatar, Name, Mail, Rolle, Anzahl offene Aufgaben.
 *
 * Datenquellen: `workspace_members` (für die Rollen-Zuordnung), die
 * geteilte `useUserDirectory()` (für Name/Mail/Initialen), und die volle
 * Task-Liste, aus der Open-Tasks pro Assignee summiert werden.
 *
 * Die Open-Status-Erkennung läuft über `task_statuses` (`completed`-Flag)
 * — dieselbe Heuristik wie im MyTasks-Widget, damit die Zahlen
 * dashboard-konsistent bleiben.
 */
export function TeamMembersListPage() {
  const [query, setQuery] = useState('');
  const { byIri, isLoading: usersLoading } = useUserDirectory();

  const { result: members, query: membersQuery } = useList<Row<WorkspaceMemberJsonld>>({
    resource: 'workspace_members',
    pagination: { mode: 'off' },
  });

  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { mode: 'off' },
  });
  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
  });

  const openStatusIris = useMemo(() => {
    const set = new Set<string>();
    for (const s of statuses?.data ?? []) {
      const completed =
        (s as { completed?: boolean }).completed ?? s.isCompleted ?? false;
      if (s['@id'] && !completed) set.add(s['@id']);
    }
    return set;
  }, [statuses]);

  const openTasksPerUser = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks?.data ?? []) {
      const isOpen = t.status ? openStatusIris.has(t.status) : true;
      if (!isOpen) continue;
      for (const a of t.assignees ?? []) {
        counts[a] = (counts[a] ?? 0) + 1;
      }
    }
    return counts;
  }, [tasks, openStatusIris]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (members?.data ?? [])
      .map((m) => {
        const u = m.user ? byIri[m.user] : null;
        return { m, u };
      })
      .filter(({ u }) => {
        if (!term) return true;
        if (!u) return false;
        const name = userDisplayName(u).toLowerCase();
        return name.includes(term) || (u.email ?? '').toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const na = a.u ? userDisplayName(a.u) : '~';
        const nb = b.u ? userDisplayName(b.u) : '~';
        return na.localeCompare(nb);
      });
  }, [members, byIri, query]);

  const isLoading = membersQuery.isLoading || usersLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl">Mitglieder</h2>
          <p className="text-sm text-muted-foreground">
            Alle Mitglieder dieses Workspace inkl. Rollen und Workload.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name oder Email…"
            className="pl-8"
          />
        </div>
      </div>

      <InviteMembersCard />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Keine Mitglieder gefunden.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ m, u }) => {
            const roleInfo = ROLE_LABEL[m.role ?? 'member'] ?? ROLE_LABEL.member;
            const RoleIcon = roleInfo.icon;
            const openCount = u?.['@id'] ? openTasksPerUser[u['@id']] ?? 0 : 0;
            return (
              <Card key={m['@id']} className="overflow-hidden">
                <CardContent className="flex items-center gap-3 p-4">
                  <Avatar size="lg" className="shrink-0">
                    <AvatarFallback>
                      {u ? userInitials(u) : '?'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="truncate text-sm font-medium">
                      {u ? userDisplayName(u) : 'Unbekannt'}
                    </div>
                    {u?.email ? (
                      <a
                        href={`mailto:${u.email}`}
                        className="inline-flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Mail className="size-3" />
                        {u.email}
                      </a>
                    ) : null}
                    <div className="flex items-center gap-2 pt-1">
                      <Badge
                        variant="outline"
                        className={cn('gap-1 text-[10px]', roleInfo.tone)}
                      >
                        <RoleIcon className="size-3" />
                        {roleInfo.label}
                      </Badge>
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CheckSquare className="size-3" />
                        {openCount} {openCount === 1 ? 'Aufgabe' : 'Aufgaben'} offen
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
