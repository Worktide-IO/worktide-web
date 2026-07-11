import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart3,
  Briefcase,
  Clock,
  Receipt,
  Tag,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';

import { BurndownTab } from './tabs/BurndownTab';
import { CreatedVsResolvedTab } from './tabs/CreatedVsResolvedTab';
import { CumulativeFlowTab } from './tabs/CumulativeFlowTab';
import { CycleTimeTab } from './tabs/CycleTimeTab';
import { MrrTab } from './tabs/MrrTab';
import { ThroughputTab } from './tabs/ThroughputTab';

type ReportGroup = {
  key: string | null;
  label: string;
  minutes: number;
  billableMinutes: number;
  billedMinutes: number;
};

type ReportResponse = {
  from: string;
  to: string;
  groupBy: 'user' | 'project' | 'task' | 'typeOfWork';
  totalMinutes: number;
  billableMinutes: number;
  billedMinutes: number;
  groups: ReportGroup[];
};

function todayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function fmtHours(min: number): string {
  const h = min / 60;
  if (h === 0) return '0 h';
  if (h < 10) return `${h.toFixed(1)} h`;
  return `${Math.round(h)} h`;
}

const PIE_COLORS = [
  '#6366f1',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

/**
 * Auswertungen-Hub. Defaultmäßig wird der letzte 30-Tage-Slot ausgewertet,
 * der Date-Range ist anpassbar. Alle Charts ziehen die gleiche
 * `/v1/reports/time`-Quelle nur mit anderem `groupBy`. Das Backend
 * aggregiert serverseitig (Doctrine `SUM(durationMinutes)`), wir rendern
 * nur — kein Client-seitiges Sammeln pro Eintrag.
 *
 * Drei Achsen:
 *   1. KPI-Karten: Total, Billable, Billed, Avg/Tag, Aktive User
 *   2. Stunden pro User (horizontales BarChart, billable+nicht-billable
 *      gestapelt)
 *   3. Stunden pro Projekt (Donut) und pro typeOfWork (vertikale Bars)
 *      side-by-side
 */
/**
 * Top-level Reports route — orchestrates the analytics tabs. The
 * existing TimeReport (the most-used view) stays the default tab so
 * the URL `/reports` doesn't break any saved-link behaviour.
 *
 * Each child tab manages its own filters + queries; the parent only
 * provides the tab chrome.
 */
export function ReportsPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl">{t('reports.heading')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('reports.subtitle')}
        </p>
      </div>
      <Tabs defaultValue="time">
        <TabsList>
          <TabsTrigger value="time">{t('reports.tab_time')}</TabsTrigger>
          <TabsTrigger value="burndown">Burndown</TabsTrigger>
          <TabsTrigger value="cfd">Cumulative Flow</TabsTrigger>
          <TabsTrigger value="cvr">Created vs. Resolved</TabsTrigger>
          <TabsTrigger value="throughput">Throughput</TabsTrigger>
          <TabsTrigger value="cycle">Cycle-Time</TabsTrigger>
          <TabsTrigger value="mrr">MRR</TabsTrigger>
        </TabsList>
        <TabsContent value="time" className="pt-4">
          <TimeReportTab />
        </TabsContent>
        <TabsContent value="burndown" className="pt-4">
          <BurndownTab />
        </TabsContent>
        <TabsContent value="cfd" className="pt-4">
          <CumulativeFlowTab />
        </TabsContent>
        <TabsContent value="cvr" className="pt-4">
          <CreatedVsResolvedTab />
        </TabsContent>
        <TabsContent value="throughput" className="pt-4">
          <ThroughputTab />
        </TabsContent>
        <TabsContent value="cycle" className="pt-4">
          <CycleTimeTab />
        </TabsContent>
        <TabsContent value="mrr" className="pt-4">
          <MrrTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TimeReportTab() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => todayIso());

  const fromIso = `${from}T00:00:00.000Z`;
  const toIso = `${to}T23:59:59.999Z`;

  const fetchReport = async (groupBy: ReportResponse['groupBy']): Promise<ReportResponse> => {
    const { data } = await api.get<ReportResponse>('/reports/time', {
      params: { from: fromIso, to: toIso, groupBy },
    });
    return data;
  };

  const userReport = useQuery({
    queryKey: ['reports/time', from, to, 'user'],
    queryFn: () => fetchReport('user'),
  });
  const projectReport = useQuery({
    queryKey: ['reports/time', from, to, 'project'],
    queryFn: () => fetchReport('project'),
  });
  const towReport = useQuery({
    queryKey: ['reports/time', from, to, 'typeOfWork'],
    queryFn: () => fetchReport('typeOfWork'),
  });

  const isLoading = userReport.isLoading || projectReport.isLoading || towReport.isLoading;

  const daysInRange = useMemo(() => {
    const a = new Date(from);
    const b = new Date(to);
    return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
  }, [from, to]);

  const kpis = useMemo(() => {
    const total = userReport.data?.totalMinutes ?? 0;
    const billable = userReport.data?.billableMinutes ?? 0;
    const billed = userReport.data?.billedMinutes ?? 0;
    const activeUsers = (userReport.data?.groups ?? []).filter((g) => g.minutes > 0).length;
    return { total, billable, billed, activeUsers, avgPerDay: Math.round(total / daysInRange) };
  }, [userReport.data, daysInRange]);

  const userBars = useMemo(() => {
    return (userReport.data?.groups ?? [])
      .slice(0, 12)
      .map((g) => ({
        name: g.label,
        billable: Math.round((g.billableMinutes / 60) * 10) / 10,
        nonBillable: Math.round(((g.minutes - g.billableMinutes) / 60) * 10) / 10,
      }));
  }, [userReport.data]);

  const projectPie = useMemo(() => {
    return (projectReport.data?.groups ?? [])
      .slice(0, 8)
      .map((g) => ({
        name: g.label,
        value: Math.round((g.minutes / 60) * 10) / 10,
      }));
  }, [projectReport.data]);

  const towBars = useMemo(() => {
    return (towReport.data?.groups ?? [])
      .slice(0, 12)
      .map((g) => ({
        name: g.label,
        hours: Math.round((g.minutes / 60) * 10) / 10,
      }));
  }, [towReport.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-end gap-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="from" className="text-xs">{t('reports.from')}</Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="to" className="text-xs">{t('reports.to')}</Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from}
              max={todayIso()}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Badge variant="outline" className="h-8 px-3">
            {t('reports.days_count', { count: daysInRange })}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiCard
          label={t('reports.kpi_total')}
          value={fmtHours(kpis.total)}
          icon={Clock}
          loading={isLoading}
        />
        <KpiCard
          label="Billable"
          value={fmtHours(kpis.billable)}
          hint={kpis.total > 0 ? `${Math.round((kpis.billable / kpis.total) * 100)} %` : undefined}
          icon={Briefcase}
          loading={isLoading}
        />
        <KpiCard
          label={t('reports.kpi_billed')}
          value={fmtHours(kpis.billed)}
          hint={kpis.billable > 0 ? `${Math.round((kpis.billed / kpis.billable) * 100)} %` : undefined}
          icon={Receipt}
          loading={isLoading}
        />
        <KpiCard
          label={t('reports.kpi_avg_day')}
          value={fmtHours(kpis.avgPerDay)}
          icon={BarChart3}
          loading={isLoading}
        />
        <KpiCard
          label={t('reports.kpi_active_users')}
          value={String(kpis.activeUsers)}
          icon={Users}
          loading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4 text-muted-foreground" /> {t('reports.hours_per_user')}
          </CardTitle>
          <CardDescription>{t('reports.hours_per_user_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {userReport.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : userBars.length === 0 ? (
            <EmptyState icon={Users} text={t('reports.empty_time_entries')} />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(260, userBars.length * 28)}>
              <BarChart data={userBars} layout="vertical" margin={{ left: 24, right: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" unit=" h" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${Number(v) || 0} h`} />
                <Bar dataKey="billable" stackId="a" name="Billable" fill="#10b981" />
                <Bar dataKey="nonBillable" stackId="a" name={t('reports.non_billable')} fill="#94a3b8" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Briefcase className="size-4 text-muted-foreground" /> {t('reports.hours_per_project')}
            </CardTitle>
            <CardDescription>{t('reports.hours_per_project_desc')}</CardDescription>
          </CardHeader>
          <CardContent>
            {projectReport.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : projectPie.length === 0 ? (
              <EmptyState icon={Briefcase} text={t('reports.empty_project_data')} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={projectPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    label={(props: { name?: string; percent?: number }) => {
                      const pct = props.percent ?? 0;
                      return pct > 0.05 ? `${props.name ?? ''} ${Math.round(pct * 100)}%` : '';
                    }}
                    labelLine={false}
                  >
                    {projectPie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => `${Number(v) || 0} h`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="size-4 text-muted-foreground" /> {t('reports.hours_per_activity')}
            </CardTitle>
            <CardDescription>Type-of-Work-Buckets</CardDescription>
          </CardHeader>
          <CardContent>
            {towReport.isLoading ? (
              <Skeleton className="h-72 w-full" />
            ) : towBars.length === 0 ? (
              <EmptyState icon={Tag} text={t('reports.empty_activity_data')} />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={towBars} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis unit=" h" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `${Number(v) || 0} h`} />
                  <Bar dataKey="hours" fill="#6366f1" name={t('reports.hours')} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof Clock;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-medium">{value}</span>
            {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Clock; text: string }) {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
      <Icon className="size-8 opacity-30" />
      {text}
    </div>
  );
}
