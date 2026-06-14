import { useGetIdentity, useList, useLogout } from '@refinedev/core';
import { LogOut } from 'lucide-react';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { Row } from '@/lib/refine';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
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
 * Stub dashboard for the very first end-to-end run. Once the real data is
 * flowing it shows the authenticated user, the active workspace, and a
 * sanity list of projects via shadcn primitives.
 *
 * Replace with the Refine <ThemedLayout> once we lay out the proper
 * navigation shell; this hand-rolled header keeps the surface area minimal.
 *
 * Note on the status column: API Platform's JSON-LD output serialises
 * relations as IRIs ("/v1/project_statuses/<uuid>"), so the status field is
 * a bare string here. To render the human-readable name we'd either need to
 * (a) join via useMany on the relation, or (b) ask the backend for a
 * groups-expanded projection. Deferred — for the smoke test the IRI is fine.
 */
// Identity comes from the custom /v1/auth/me endpoint which isn't in the
// OpenAPI spec — keep the local shape until the backend annotates it.
type Identity = { id: string; email: string; name: string };

export function DashboardPage() {
  const { data: identity } = useGetIdentity<Identity>();
  const { mutate: logout } = useLogout();
  const { result: projects, query } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { currentPage: 1, pageSize: 10 },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
  });
  const isLoading = query.isLoading;

  const initials = identity?.name?.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg">Worktide</h1>
        <div className="flex items-center gap-3 text-sm">
          {identity ? (
            <>
              <Avatar className="size-7">
                <AvatarFallback className="text-xs">{initials || '?'}</AvatarFallback>
              </Avatar>
              <span className="text-muted-foreground">{identity.name ?? identity.email}</span>
            </>
          ) : null}
          <Separator orientation="vertical" className="h-6" />
          <Button variant="ghost" size="sm" onClick={() => logout()}>
            <LogOut className="size-4" />
            Abmelden
          </Button>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Projekte</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-2/3" />
              </div>
            ) : projects?.data?.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                Keine Projekte sichtbar.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Key</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-40">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects?.data?.map((p) => (
                    <TableRow key={p['@id']}>
                      <TableCell className="font-mono text-xs">{p.key}</TableCell>
                      <TableCell>{p.name}</TableCell>
                      <TableCell>
                        {p.status ? (
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {p.status.split('/').pop()}
                          </Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
