import { ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { topicFor, useMercureTopic } from '@/lib/mercure';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

/** One row from GET /v1/dashboard/open-customer-tasks — project + customer inlined. */
type CustomerTask = {
  '@id': string;
  id: string;
  identifier: string;
  title: string;
  priority?: string;
  dueOn: string | null;
  project: { '@id': string; id: string; name: string; color: string };
  customer: { id: string; name: string };
};

const KEY = ['dashboard', 'open-customer-tasks'] as const;

/**
 * Cross-project list of open tasks that belong to projects with an assigned
 * customer — "everything a paying customer is still waiting on". Backed by the
 * /v1/dashboard/open-customer-tasks read-model (server filters open + has-customer
 * and inlines project/customer) instead of fetching the whole tasks/projects/
 * statuses collections and filtering client-side.
 */
export function OpenCustomerTasksWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get<{ tasks: CustomerTask[]; capped: boolean }>('/dashboard/open-customer-tasks');
      return data;
    },
  });
  useMercureTopic(topicFor('tasks'), {
    onMessage: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });

  const rows = query.data?.tasks ?? [];

  return (
    <Card className="h-full overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-muted-foreground" />
          {t('widget.open_customer_tasks.label')}
          <span className="ml-auto text-xs font-normal text-muted-foreground">
            {rows.length}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-3rem)] overflow-y-auto px-2 pb-2">
        {query.isLoading ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-5/6" />
            <Skeleton className="h-9 w-4/5" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            Alle Kunden-Aufgaben sind erledigt 🎉
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((t) => {
              const project = t.project;
              const customer = t.customer;
              return (
                <li key={t['@id']}>
                  <button
                    type="button"
                    className="widget-no-drag flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/50"
                    onClick={() =>
                      project?.id && navigate(`/projects/${project.id}?tab=board`)
                    }
                  >
                    <span
                      className="mt-1 size-2 shrink-0 rounded-full"
                      aria-hidden
                      style={{ backgroundColor: project?.color ?? '#6366f1' }}
                    />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {t.identifier}
                        </span>
                        <span className="truncate text-sm font-medium">{t.title}</span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {customer?.name ?? '—'} · {project?.name}
                        {t.dueOn ? ` · ${new Date(t.dueOn).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    {t.priority && t.priority !== 'normal' ? (
                      <Badge
                        variant={PRIORITY_VARIANT[t.priority] ?? 'outline'}
                        className="ml-1 shrink-0 text-[10px]"
                      >
                        {t.priority === 'urgent'
                          ? 'Dringend'
                          : t.priority === 'high'
                            ? 'Hoch'
                            : 'Niedrig'}
                      </Badge>
                    ) : null}
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
