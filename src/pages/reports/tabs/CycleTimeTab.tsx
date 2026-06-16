import { useList } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
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

type Series = {
  bucket: string;
  resolved: number;
  avgHours: number;
  minHours: number;
  maxHours: number;
};
type Response = {
  from: string;
  to: string;
  bucket: 'day' | 'week';
  project: string | null;
  series: Series[];
};

const ALL_PROJECTS = '__all__';

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() { return new Date().toISOString().slice(0, 10); }

function fmtHours(h: number): string {
  if (h < 1) return '<1 h';
  if (h < 48) return `${Math.round(h)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

/**
 * "Wie lange dauert eine Aufgabe vom Anlegen bis zum Schließen?" —
 * Durchschnittliche Cycle-Time pro Bucket, mit Resolution-Count.
 *
 * Cycle-Time wird auf Stunden gerundet ausgegeben; im Chart als
 * "Tage" anzeigen für Lesbarkeit (1 d = 24 h).
 */
export function CycleTimeTab() {
  const [from, setFrom] = useState(() => isoDaysAgo(90));
  const [to, setTo] = useState(() => todayIso());
  const [bucket, setBucket] = useState<'day' | 'week'>('week');
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reports/cycle-time', projectId, from, to, bucket],
    queryFn: async (): Promise<Response> => {
      const params: Record<string, string> = { from, to, bucket };
      if (projectId !== ALL_PROJECTS) params.project = projectId;
      const { data } = await api.get<Response>('/reports/cycle-time', { params });
      return data;
    },
  });

  const overallAvg = (() => {
    const s = data?.series ?? [];
    if (s.length === 0) return 0;
    const weighted = s.reduce((acc, r) => acc + r.avgHours * r.resolved, 0);
    const total = s.reduce((acc, r) => acc + r.resolved, 0);
    return total === 0 ? 0 : weighted / total;
  })();

  return (
    <ReportShell
      title="Cycle-Time"
      description="Wie lange dauert eine Aufgabe vom Anlegen bis zum Schließen? Pro Bucket Durchschnitt aller geschlossenen Aufgaben."
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      extras={
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Bucket</Label>
            <Select value={bucket} onValueChange={(v) => setBucket(v as 'day' | 'week')}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Tag</SelectItem>
                <SelectItem value="week">Woche</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Projekt</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_PROJECTS}>Alle Projekte</SelectItem>
                {(projects?.data ?? []).map((p) => (
                  <SelectItem key={p['@id']} value={p.id ?? ''}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Ø Cycle-Time: <span className="font-mono">{fmtHours(overallAvg)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (data?.series ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Keine geschlossenen Aufgaben im Zeitraum.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={data!.series.map(s => ({ ...s, avgDays: +(s.avgHours / 24).toFixed(2) }))}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} label={{ value: 'Tage', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <Tooltip
                    formatter={(v, name) =>
                      name === 'avgDays' ? [`${v} d`, 'Ø Tage'] : [String(v), String(name)]
                    }
                  />
                  <Bar dataKey="avgDays" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
