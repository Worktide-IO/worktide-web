import { useList } from '@refinedev/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Area,
  AreaChart,
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

type Series = { date: string; open: number };
type Response = {
  from: string;
  to: string;
  project: string | null;
  version: string | null;
  totalTasks: number;
  series: Series[];
};

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso() { return new Date().toISOString().slice(0, 10); }

/**
 * "How fast is the backlog draining?" — daily open-task count for a
 * single project. Empty until a project is picked; that's deliberate
 * because a workspace-wide burndown is meaningless (the line just
 * reflects how many projects are running, not progress).
 */
export function BurndownTab() {
  const [from, setFrom] = useState(() => isoDaysAgo(30));
  const [to, setTo] = useState(() => todayIso());
  const [projectId, setProjectId] = useState<string>('');

  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['reports/burndown', projectId, from, to],
    queryFn: async (): Promise<Response> => {
      const { data } = await api.get<Response>('/reports/burndown', {
        params: { project: projectId, from, to },
      });
      return data;
    },
    enabled: Boolean(projectId),
  });

  return (
    <ReportShell
      title="Burndown"
      description="Anzahl offener Aufgaben pro Tag — zeigt, wie der Backlog im gewählten Zeitraum kleiner (oder größer) wird."
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      extras={
        <div className="space-y-1.5">
          <Label htmlFor="bd-project" className="text-xs">Projekt</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger id="bd-project" className="w-56">
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
            {projectId
              ? `Offene Aufgaben (${data?.totalTasks ?? 0} im Zeitraum erfasst)`
              : 'Bitte erst ein Projekt wählen.'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!projectId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Burndown braucht einen Projekt-Kontext.
            </p>
          ) : isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (data?.series ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Keine Daten im Zeitraum.
            </p>
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <AreaChart data={data!.series}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-40" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="open"
                    stroke="#6366f1"
                    fill="#6366f1"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </ReportShell>
  );
}
