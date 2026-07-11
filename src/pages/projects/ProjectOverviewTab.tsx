import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Coins, PieChart, Receipt, Timer, User2, Users } from 'lucide-react';
import { Cell, Pie, PieChart as ReChartsPie, ResponsiveContainer } from 'recharts';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  project: Row<ProjectJsonld>;
  customer: Row<CustomerJsonld> | null;
};

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

function formatHoursFromMinutes(min: number | null | undefined): string {
  if (min == null) return '—';
  const hours = Math.round((min / 60) * 10) / 10;
  return `${hours} h`;
}

export function ProjectOverviewTab({ project, customer }: Props) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('project_overview.description_title')}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground whitespace-pre-wrap">
          {project.description?.trim() ? project.description : t('project_overview.no_description')}
        </CardContent>
      </Card>

      <BudgetCard project={project} />

      <Card>
        <CardHeader>
          <CardTitle>{t('project_overview.key_data')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <DataRow icon={<Users className="size-4" />} label={t('project_overview.customer')}>
            {customer ? customer.name : t('project_overview.internal')}
          </DataRow>
          <DataRow icon={<User2 className="size-4" />} label="Owner">
            {project.owner ? (
              <span className="font-mono text-xs text-muted-foreground">{project.owner.split('/').pop()}</span>
            ) : (
              '—'
            )}
          </DataRow>
          <DataRow icon={<CalendarDays className="size-4" />} label={t('project_overview.starts_on')}>
            {formatDate(project.startsOn)}
          </DataRow>
          <DataRow icon={<CalendarDays className="size-4" />} label={t('project_overview.due_on')}>
            {formatDate(project.dueOn)}
          </DataRow>
          <DataRow icon={<Timer className="size-4" />} label="Budget">
            {formatHoursFromMinutes(project.budgetMinutes)}
          </DataRow>
          <DataRow icon={<Coins className="size-4" />} label={t('project_overview.billing')}>
            <div className="flex flex-wrap gap-2">
              {project.isBillableByDefault ? (
                <Badge variant="secondary" className="text-xs">{t('project_overview.billable_default')}</Badge>
              ) : (
                <Badge variant="outline" className="text-xs">{t('project_overview.not_billable')}</Badge>
              )}
              {project.isRetainer ? (
                <Badge variant="outline" className="text-xs">Retainer</Badge>
              ) : null}
              {project.deductNonBillableHours ? (
                <Badge variant="outline" className="text-xs">{t('project_overview.non_billable_deducts')}</Badge>
              ) : null}
            </div>
          </DataRow>
          <DataRow icon={<Receipt className="size-4" />} label={t('project_overview.multi_assignment')}>
            {project.isMultiAssignmentAllowed ? t('project_overview.allowed') : t('project_overview.locked')}
          </DataRow>
        </CardContent>
      </Card>
    </div>
  );
}

function DataRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 grid grid-cols-[8rem_1fr] gap-2">
        <div className="text-muted-foreground">{label}</div>
        <div className="text-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * Budget-Auslastung als Donut + KPI-Block.
 *
 * Zieht alle TimeEntries des Projekts via `/v1/reports/time` (das schon
 * existiert) und stellt die Summe gegen `project.budgetMinutes`. Wenn
 * kein Budget gesetzt ist, zeigen wir die geleisteten Stunden trotzdem
 * — als Info-Karte ohne Soll/Ist-Vergleich.
 *
 * Farb-Schema:
 *   - <80% genutzt: Indigo (auf Kurs)
 *   - 80–100%:      Amber (Warnung)
 *   - >100%:        Destruktiv-rot (Überzogen)
 */
function BudgetCard({ project }: { project: Row<ProjectJsonld> }) {
  const { t } = useTranslation();
  const projectIri = project['@id'] ?? '';

  // Wide range to catch everything ever booked on this project. The
  // backend caps at 366 days, so we shift the window in chunks if we
  // ever push past that — for V1 a year-back is enough.
  const from = new Date();
  from.setFullYear(from.getFullYear() - 1);
  const to = new Date();
  to.setDate(to.getDate() + 1);

  const { data: report, isLoading } = useQuery({
    queryKey: ['project-budget', project.id],
    queryFn: async () => {
      const { data } = await api.get<{
        totalMinutes: number;
        billableMinutes: number;
        billedMinutes: number;
      }>('/reports/time', {
        params: {
          from: from.toISOString(),
          to: to.toISOString(),
          groupBy: 'user',
          project: project.id,
        },
      });
      return data;
    },
    enabled: Boolean(project.id),
    staleTime: 60_000,
  });
  void projectIri; // referenced by query key indirectly via project.id

  const budget = project.budgetMinutes ?? null;
  const tracked = report?.totalMinutes ?? 0;
  const billable = report?.billableMinutes ?? 0;
  const remaining = budget !== null ? Math.max(0, budget - tracked) : null;
  const pctUsed = budget && budget > 0 ? Math.round((tracked / budget) * 100) : null;

  // Pie-Daten: tracked + remaining (oder Über-Budget-Differenz als
  // eigene Schicht in destructive)
  const chartData =
    budget !== null && budget > 0
      ? tracked <= budget
        ? [
            { name: 'verbraucht', value: tracked, color: pctUsed && pctUsed >= 80 ? '#f59e0b' : '#6366f1' },
            { name: 'verbleibt', value: remaining ?? 0, color: '#e5e7eb' },
          ]
        : [
            { name: 'Budget', value: budget, color: '#ef4444' },
            { name: 'Über-Budget', value: tracked - budget, color: '#fca5a5' },
          ]
      : null;

  return (
    <Card className="md:row-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="size-5 text-muted-foreground" />
          Budget
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : budget === null || budget === 0 ? (
          <div className="space-y-2 text-sm">
            <p className="text-muted-foreground">
              {t('project_overview.no_budget', { hours: formatHoursFromMinutes(tracked) })}
            </p>
          </div>
        ) : (
          <>
            <div className="relative h-44">
              <ResponsiveContainer width="100%" height="100%">
                <ReChartsPie>
                  <Pie
                    data={chartData ?? []}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={72}
                    paddingAngle={2}
                    startAngle={90}
                    endAngle={-270}
                  >
                    {(chartData ?? []).map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                </ReChartsPie>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div
                  className={
                    pctUsed !== null && pctUsed > 100
                      ? 'text-2xl font-semibold text-destructive'
                      : pctUsed !== null && pctUsed >= 80
                        ? 'text-2xl font-semibold text-amber-600'
                        : 'text-2xl font-semibold'
                  }
                >
                  {pctUsed ?? 0} %
                </div>
                <div className="text-xs text-muted-foreground">{t('project_overview.consumed')}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <BudgetStat label="Budget" value={formatHoursFromMinutes(budget)} />
              <BudgetStat label={t('project_overview.booked')} value={formatHoursFromMinutes(tracked)} />
              <BudgetStat
                label={remaining !== null && tracked > budget ? t('project_overview.over') : t('project_overview.rest')}
                value={
                  tracked > (budget ?? 0)
                    ? `-${formatHoursFromMinutes(tracked - (budget ?? 0))}`
                    : formatHoursFromMinutes(remaining)
                }
                tone={tracked > (budget ?? 0) ? 'destructive' : 'default'}
              />
            </div>
            {billable > 0 && billable !== tracked ? (
              <p className="text-center text-[10px] text-muted-foreground pt-1">
                {t('project_overview.billable_of', { hours: formatHoursFromMinutes(billable) })}
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'destructive';
}) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className={tone === 'destructive' ? 'font-semibold text-destructive' : 'font-semibold'}>
        {value}
      </div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}
