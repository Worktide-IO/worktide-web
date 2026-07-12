import { useList } from '@refinedev/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderKanban } from 'lucide-react';
import { Link } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import { fetchProjectProgress, type ProjectProgress } from '@/lib/files';
import type { Row } from '@/lib/refine';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
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
 * Customer-scoped project list with a task-completion progress bar per project.
 * Progress ({total, closed, percent}) comes from /reports/project-progress
 * (derived from Task.closedOn); mirrors the ProjectWallCard bar.
 */
export function CustomerProjectsTab({
  customerId,
  customerIri,
}: {
  customerId: string;
  customerIri: string;
}) {
  const { t } = useTranslation();
  const { result, query } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    sorters: [{ field: 'updatedAt', order: 'desc' }],
  });
  const rows = result?.data ?? [];

  const [progress, setProgress] = useState<Record<string, ProjectProgress>>({});
  useEffect(() => {
    let active = true;
    fetchProjectProgress(customerId)
      .then((p) => {
        if (active) setProgress(p);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [customerId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('customer_projects.title', { n: rows.length })}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            {t('customer_projects.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>{t('customer_projects.col_project')}</TableHead>
                <TableHead className="w-64">{t('customer_projects.col_progress')}</TableHead>
                <TableHead className="w-28 text-right">{t('customer_projects.col_tasks')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => {
                const prog = p['@id'] ? progress[p['@id']] : undefined;
                const pct = prog?.percent ?? 0;
                const hasTasks = (prog?.total ?? 0) > 0;
                return (
                  <TableRow key={p['@id']}>
                    <TableCell>
                      <FolderKanban className="size-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {hasTasks ? (
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-1.5" />
                          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                            {pct}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {t('customer_projects.no_tasks')}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {prog ? `${prog.closed} / ${prog.total}` : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
