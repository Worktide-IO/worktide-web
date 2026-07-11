import { useList } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';

import { ReportShell } from './ReportShell';

type Point = { taskId: string; identifier: string | null; closedOn: string; hours: number; days: number };
type Response = {
  from: string;
  to: string;
  project: string | null;
  count: number;
  averageHours: number | null;
  percentiles: { p50: number; p85: number; p95: number } | null;
  points: Point[];
};

const ALL_PROJECTS = '__all__';

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtHours(h: number | null | undefined): string {
  if (h == null) return '—';
  if (h < 1) return '<1 h';
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-lg">{value}</div>
      {hint ? <div className="text-[10px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/**
 * "Wie lange dauert die eigentliche Bearbeitung?" — Cycle-Time je erledigter
 * Aufgabe (erster Statuswechsel → Abschluss) als Streudiagramm, plus die
 * Verteilungs-Perzentile p50/p85/p95 (Kanban-Standard statt reinem Mittelwert).
 * Punkte über der p85-Linie sind die Ausreißer, die den Fluss bremsen.
 */
export function CycleTimeTab() {
  const { t: translate } = useTranslation();
  const [from, setFrom] = useState(() => isoDaysAgo(90));
  const [to, setTo] = useState(() => todayIso());
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reports/cycle-time', projectId, from, to],
    queryFn: async (): Promise<Response> => {
      const params: Record<string, string> = { from, to };
      if (projectId !== ALL_PROJECTS) params.project = projectId;
      const { data } = await api.get<Response>('/reports/cycle-time', { params });
      return data;
    },
  });

  const pct = data?.percentiles ?? null;
  const points = (data?.points ?? []).map((p) => ({ ...p, x: Date.parse(p.closedOn) }));

  return (
    <ReportShell
      title="Cycle-Time"
      description={translate('cycle_time.description')}
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      extras={
        <div className="space-y-1.5">
          <Label className="text-xs">{translate('cycle_time.project')}</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_PROJECTS}>{translate('cycle_time.all_projects')}</SelectItem>
              {(projects?.data ?? []).map((p) => (
                <SelectItem key={p['@id']} value={p.id ?? ''}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{translate('cycle_time.distribution')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : (data?.count ?? 0) === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {translate('cycle_time.empty')}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Stat label={translate('cycle_time.stat_tasks')} value={String(data?.count ?? 0)} />
                <Stat label="Ø" value={fmtHours(data?.averageHours)} />
                <Stat label="p50 (Median)" value={fmtHours(pct?.p50)} hint={translate('cycle_time.hint_p50')} />
                <Stat label="p85" value={fmtHours(pct?.p85)} hint={translate('cycle_time.hint_p85')} />
                <Stat label="p95" value={fmtHours(pct?.p95)} hint="Worst case" />
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={['dataMin', 'dataMax']}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(t) => new Date(t).toLocaleDateString()}
                      name="Abschluss"
                    />
                    <YAxis
                      type="number"
                      dataKey="days"
                      tick={{ fontSize: 11 }}
                      label={{ value: translate('cycle_time.axis_days'), angle: -90, position: 'insideLeft', fontSize: 11 }}
                    />
                    <ZAxis range={[36, 36]} />
                    {pct ? (
                      <>
                        <ReferenceLine y={pct.p50 / 24} stroke="#22c55e" strokeDasharray="4 4" label={{ value: 'p50', fontSize: 10, fill: '#22c55e', position: 'right' }} />
                        <ReferenceLine y={pct.p85 / 24} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'p85', fontSize: 10, fill: '#f59e0b', position: 'right' }} />
                        <ReferenceLine y={pct.p95 / 24} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'p95', fontSize: 10, fill: '#ef4444', position: 'right' }} />
                      </>
                    ) : null}
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const p = payload[0].payload as Point;
                        return (
                          <div className="rounded-md border bg-background px-2 py-1 text-xs shadow-sm">
                            <div className="font-medium">{p.identifier ?? p.taskId.slice(0, 8)}</div>
                            <div>
                              {fmtHours(p.hours)} · {new Date(p.closedOn).toLocaleDateString()}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={points} fill="#6366f1" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
