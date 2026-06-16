import { useList } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

/**
 * "Are we keeping up?" — created vs. resolved per bucket. When the
 * resolved line trails the created one persistently the backlog is
 * growing.
 */
export function CreatedVsResolvedTab() {
  const [from, setFrom] = useState(() => isoDaysAgo(60));
  const [to, setTo] = useState(() => todayIso());
  const [bucket, setBucket] = useState<'day' | 'week'>('week');
  const [projectId, setProjectId] = useState<string>(ALL_PROJECTS);

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reports/cvr', projectId, from, to, bucket],
    queryFn: async (): Promise<Response> => {
      const params: Record<string, string> = { from, to, bucket };
      if (projectId !== ALL_PROJECTS) params.project = projectId;
      const { data } = await api.get<Response>('/reports/created-vs-resolved', { params });
      return data;
    },
  });

  return (
    <ReportShell
      title="Created vs. Resolved"
      description="Pro Tag oder Woche: Wieviele Aufgaben kamen rein, wieviele wurden geschlossen?"
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
          <CardTitle className="text-base">Volumen pro {bucket === 'day' ? 'Tag' : 'Woche'}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (data?.series ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Keine Daten im Zeitraum.</p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <LineChart data={data!.series}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="created" name="Erstellt" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="resolved" name="Erledigt" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
