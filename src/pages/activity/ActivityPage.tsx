import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import {
  CheckSquare,
  Clock,
  FileText,
  FolderKanban,
  MessageSquare,
  Server,
  Trash2,
  UserCircle,
  Wifi,
  WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { DomainEventJsonld } from '@/api/types/domainEvent/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useUserDirectory, userDisplayName, userInitials } from '@/hooks/useUserDirectory';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { timeAgo } from '@/lib/time';

/**
 * Activity feed — workspace-wide chronological list of DomainEventLog
 * entries. Read-only; same data feeds the future Mercure-driven
 * notification badge.
 *
 * Filter set deliberately tight (Aggregate-Type + Actor + Suchbegriff)
 * — adding date-range later is a one-line addition since the DateFilter
 * is already exposed on the API resource.
 */

const AGGREGATE_LABEL: Record<string, string> = {
  Project: 'aggregate.Project',
  Task: 'aggregate.Task',
  Comment: 'aggregate.Comment',
  File: 'aggregate.File',
  FileVersion: 'aggregate.FileVersion',
  TimeEntry: 'aggregate.TimeEntry',
  User: 'aggregate.User',
  Customer: 'aggregate.Customer',
  Contact: 'aggregate.Contact',
  CustomerSystem: 'aggregate.CustomerSystem',
  ServiceSubscription: 'aggregate.ServiceSubscription',
  Document: 'aggregate.Document',
  Watch: 'aggregate.Watch',
};

const ICON_BY_AGGREGATE: Record<string, LucideIcon> = {
  Project: FolderKanban,
  Task: CheckSquare,
  Comment: MessageSquare,
  File: FileText,
  FileVersion: FileText,
  TimeEntry: Clock,
  User: UserCircle,
  CustomerSystem: Server,
  Document: FileText,
};

const VERB_BY_SUFFIX: Record<string, string> = {
  created: 'erstellt',
  updated: 'aktualisiert',
  deleted: 'gelöscht',
  closed: 'geschlossen',
  opened: 'geöffnet',
  archived: 'archiviert',
};

export function ActivityPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [aggregateFilter, setAggregateFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');

  const filters = [];
  if (search) filters.push({ field: 'name', operator: 'contains' as const, value: search });
  if (aggregateFilter !== 'all') {
    filters.push({ field: 'aggregateType', operator: 'eq' as const, value: aggregateFilter });
  }
  if (actorFilter !== 'all') {
    filters.push({ field: 'actor', operator: 'eq' as const, value: actorFilter });
  }

  const { result, query } = useList<Row<DomainEventJsonld>>({
    resource: 'domain_events',
    pagination: { currentPage: 1, pageSize: 100 },
    sorters: [{ field: 'occurredAt', order: 'desc' }],
    filters,
  });
  const { connected: liveConnected } = useLiveResource('domain_events');

  const { users, byIri: userByIri } = useUserDirectory();
  const rows = result?.data ?? [];
  const total = result?.total ?? rows.length;

  const aggregateOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.aggregateType) seen.add(r.aggregateType);
    }
    for (const k of Object.keys(AGGREGATE_LABEL)) seen.add(k);
    return Array.from(seen).sort();
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">Aktivität</h2>
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
          <p className="text-sm text-muted-foreground">{total} Ereignisse</p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>Filter</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Event-Name (z. B. task.updated)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={aggregateFilter} onValueChange={setAggregateFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Entity-Typ" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Typen</SelectItem>
                {aggregateOptions.map((k) => (
                  <SelectItem key={k} value={k}>
                    {AGGREGATE_LABEL[k] ? t(AGGREGATE_LABEL[k]) : k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actorFilter} onValueChange={setActorFilter}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Benutzer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Benutzer</SelectItem>
                {users.map((u) => (
                  <SelectItem key={u['@id']} value={u['@id'] ?? ''}>
                    {userDisplayName(u)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              Keine Ereignisse mit diesen Filtern.
            </p>
          ) : (
            <ul className="divide-y">
              {rows.map((e) => {
                const Icon = ICON_BY_AGGREGATE[e.aggregateType ?? ''] ?? FileText;
                const verb = verbFor(e.name);
                const actor = e.actor ? userByIri[e.actor] : null;
                return (
                  <li key={e['@id']} className="flex items-start gap-3 py-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-1.5 text-sm">
                        {actor ? (
                          <Avatar className="size-4">
                            <AvatarFallback className="text-[8px]">
                              {userInitials(actor)}
                            </AvatarFallback>
                          </Avatar>
                        ) : (
                          <div className="size-4" />
                        )}
                        <span className="font-medium">
                          {actor ? userDisplayName(actor) : <span className="italic text-muted-foreground">System</span>}
                        </span>
                        <span className="text-muted-foreground">hat</span>
                        <Badge variant="outline" className="text-[10px]">
                          {AGGREGATE_LABEL[e.aggregateType ?? ''] ? t(AGGREGATE_LABEL[e.aggregateType ?? '']) : (e.aggregateType ?? '—')}
                        </Badge>
                        <span className="text-muted-foreground">{verb}</span>
                        {e.aggregateId ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{e.aggregateId.slice(-8)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="font-mono">{e.name}</span>
                        <span>{timeAgo(e.occurredAt)}</span>
                        {e.occurredAt ? (
                          <span className="tabular-nums">
                            {new Date(e.occurredAt).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {e.name?.endsWith('.deleted') ? (
                      <Trash2 className="size-4 text-destructive/70" />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function verbFor(name: string | undefined): string {
  if (!name) return '—';
  const suffix = name.split('.').pop() ?? name;
  return VERB_BY_SUFFIX[suffix] ?? suffix;
}
