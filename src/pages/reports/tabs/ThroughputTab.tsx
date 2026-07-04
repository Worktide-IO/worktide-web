import { useList } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

type Series = { bucket: string; created: number; resolved: number };
type Response = { from: string; to: string; project: string | null; bucket: string; series: Series[] };

const ALL_PROJECTS = '__all__';
const ROLL = 4; // rolling-average window (weeks)

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Wie viel schließen wir pro Woche ab?" — Throughput als Balken je Woche
 * (erledigte Aufgaben nach closedOn) plus ein gleitender 4-Wochen-Schnitt als
 * Linie, der den Trend glättet. Reine Rate — Ausschläge nach unten = Engpass.
 * Nutzt die resolved-Serie des created-vs-resolved-Reports.
 */
export function ThroughputTab() {
  const [from, setFrom] = useState(() => isoDaysAgo(180));
  const [to, setTo] = useState(() => todayIso());
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reports/throughput', projectId, from, to],
    queryFn: async () => {
      const params: Record<string, string> = { from, to, bucket: 'week' };
      if (projectId !== ALL_PROJECTS) params.project = projectId;
      const { data } = await api.get<Response>('/reports/created-vs-resolved', { params });
      return data;
    },
  });

  const series = data?.series ?? [];
  // Throughput + trailing rolling average, computed client-side.
  const points = series.map((s, i) => {
    const window = series.slice(Math.max(0, i - ROLL + 1), i + 1);
    const avg = window.reduce((n, w) => n + w.resolved, 0) / window.length;
    return { bucket: s.bucket, resolved: s.resolved, avg: Math.round(avg * 10) / 10 };
  });
  const totalResolved = series.reduce((n, s) => n + s.resolved, 0);
  const avgPerWeek = series.length ? Math.round((totalResolved / series.length) * 10) / 10 : 0;

  return (
    <ReportShell
      title="Throughput"
      description="Abgeschlossene Aufgaben pro Woche (nach Abschlussdatum) mit gleitendem 4-Wochen-Durchschnitt. Die Rate zeigt die Liefergeschwindigkeit — nicht wie viel offen ist."
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      extras={
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
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Erledigt pro Woche</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : series.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Keine abgeschlossenen Aufgaben im Zeitraum.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-md border px-3 py-2">
                  <div className="text-xs text-muted-foreground">Gesamt erledigt</div>
                  <div className="font-mono text-lg">{totalResolved}</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="text-xs text-muted-foreground">Ø pro Woche</div>
                  <div className="font-mono text-lg">{avgPerWeek}</div>
                </div>
                <div className="rounded-md border px-3 py-2">
                  <div className="text-xs text-muted-foreground">Wochen</div>
                  <div className="font-mono text-lg">{series.length}</div>
                </div>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer>
                  <ComposedChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="resolved" name="Erledigt" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      name={`Ø ${ROLL} Wochen`}
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
