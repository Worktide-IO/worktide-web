import { useList } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
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

type StatusMeta = {
  id: string;
  name: string;
  color: string;
  position: number;
  isCompleted: boolean;
};
type CfdSeries = { date: string; counts: Record<string, number> };
type Response = {
  from: string;
  to: string;
  project: string | null;
  version: string | null;
  statuses: StatusMeta[];
  series: CfdSeries[];
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() { return new Date().toISOString().slice(0, 10); }

/**
 * Cumulative Flow Diagram — stacked area of how many tasks sit in each
 * status per day. Widening bands signal a bottleneck; a steadily growing
 * total signals scope creep. Project-scoped (like Burndown): a
 * workspace-wide mix of statuses isn't meaningful.
 *
 * Bands are stacked with completed statuses at the bottom (the classic CFD
 * layout, so "done" accumulates underneath the work still in flight).
 */
export function CumulativeFlowTab() {
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => todayIso());
  const [projectId, setProjectId] = useState<string>('');

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reports/cumulative-flow', projectId, from, to],
    queryFn: async (): Promise<Response> => {
      const { data } = await api.get<Response>('/reports/cumulative-flow', {
        params: { project: projectId, from, to },
      });
      return data;
    },
    enabled: Boolean(projectId),
  });

  // Higher position = closer to done → render those first so they stack at
  // the bottom.
  const stackOrder = useMemo(
    () => [...(data?.statuses ?? [])].sort((a, b) => b.position - a.position),
    [data?.statuses],
  );

  // Flatten { date, counts: { id: n } } into recharts rows keyed by status id.
  const chartData = useMemo(() => {
    const statuses = data?.statuses ?? [];
    return (data?.series ?? []).map((row) => {
      const r: Record<string, string | number> = { date: row.date };
      for (const s of statuses) r[s.id] = row.counts[s.id] ?? 0;
      return r;
    });
  }, [data?.series, data?.statuses]);

  const hasData = chartData.length > 0 && (data?.statuses ?? []).length > 0;

  return (
    <ReportShell
      title="Cumulative Flow"
      description="Aufgaben pro Status und Tag, gestapelt. Breiter werdende Bänder zeigen Engpässe; eine stetig wachsende Gesamthöhe deutet auf Scope-Creep."
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      extras={
        <div className="space-y-1.5">
          <Label htmlFor="cfd-project" className="text-xs">Projekt</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="cfd-project" className="w-56">
              <SelectValue placeholder="Projekt wählen…" />
            </SelectTrigger>
            <SelectContent>
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
          <CardTitle className="text-base">
            {projectId ? 'Status-Verteilung im Zeitverlauf' : 'Bitte erst ein Projekt wählen.'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!projectId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Das Cumulative-Flow-Diagramm braucht einen Projekt-Kontext.
            </p>
          ) : isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : !hasData ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Keine Daten im Zeitraum.
            </p>
          ) : (
            <>
              <div className="h-72 w-full">
                <ResponsiveContainer>
                  <AreaChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    {stackOrder.map((s) => (
                      <Area
                        key={s.id}
                        type="monotone"
                        dataKey={s.id}
                        name={s.name}
                        stackId="cfd"
                        stroke={s.color}
                        fill={s.color}
                        fillOpacity={0.55}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="pt-3 text-xs text-muted-foreground">
                Historische Bänder werden aus protokollierten Status-Wechseln rekonstruiert;
                Wechsel vor Einführung des Ereignis-Logs erscheinen im jeweils frühesten bekannten Status.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
