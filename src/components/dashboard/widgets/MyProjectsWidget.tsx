import { useGetIdentity, useList } from '@refinedev/core';
import { FolderKanban } from 'lucide-react';
import { useNavigate } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Identity = { id?: string };

/**
 * Widget: lists the projects the current user is a ProjectMember of.
 * Mirrors the awork "Meine Projekte" tile — narrow, hyperlinkable rows
 * with a colour dot and the customer name.
 *
 * Mercure live so a member being added to a project elsewhere shows up
 * here without a refresh.
 */
export function MyProjectsWidget() {
  const navigate = useNavigate();
  const { data: identity } = useGetIdentity<Identity>();
  const userIri = identity?.id ? `/v1/users/${identity.id}` : null;

  const { result: projects, query } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters: userIri
      ? [
          { field: 'members.user', operator: 'eq', value: userIri },
          { field: 'isArchived', operator: 'eq', value: 'false' },
        ]
      : [],
    queryOptions: { enabled: Boolean(userIri) },
  });
  useLiveResource('projects');

  // Render customer names alongside the row — IRI → row lookup, single
  // workspace-wide fetch shared with other widgets via tanstack cache.
  const rows = projects?.data ?? [];
  const customerByIri = useCustomerLookup(rows.map((p) => p.customer));

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderKanban className="size-4 text-muted-foreground" />
          Meine Projekte
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {rows.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3rem)] overflow-y-auto px-2 pb-2">
        {query.isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-5/6" />
            <Skeleton className="h-8 w-4/5" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Du bist noch keinem Projekt zugewiesen.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((p) => {
              const customer = p.customer ? customerByIri[p.customer] : null;
              return (
                <li key={p['@id']}>
                  <button
                    type="button"
                    className="widget-no-drag flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                    onClick={() => p.id && navigate(`/projects/${p.id}`)}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color ?? '#6366f1' }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        <span className="font-mono">{p.key}</span>
                        {customer ? ` · ${customer.name}` : ' · — Intern —'}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
