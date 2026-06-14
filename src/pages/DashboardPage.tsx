import { useList } from '@refinedev/core';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
 * First real page on top of the AppLayout shell — lists projects in the
 * active workspace. Replaced by a richer "/" landing once we add Kanban
 * boards / time-summary widgets / autopilot alerts; for now this proves
 * the data round-trip and provides the entry point to drill into a project.
 *
 * Status column shows the bare IRI suffix for now — see the comment in the
 * Refine data provider for why JSON-LD relations are unresolved strings
 * (we'll add an embed-projection or a useMany lookup once detail pages land).
 */
export function DashboardPage() {
  const { result: projects, query } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { currentPage: 1, pageSize: 20 },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
  });
  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <h2 className="text-2xl">Projekte</h2>
      <Card>
        <CardHeader>
          <CardTitle>Zuletzt aktualisiert</CardTitle>
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
    </div>
  );
}
