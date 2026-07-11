import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bot, Play, User as UserIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { aiErrorMessage } from '@/lib/ai';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import {
  MISSION_STATUS_LABEL,
  MISSION_STATUS_VARIANT,
  OBJECTIVE_LABEL,
  researchMission,
  type LeadJsonld,
  type MissionMessageJsonld,
  type ResearchMissionJsonld,
} from '@/lib/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LeadsTable } from './LeadsTable';

const CAN_RUN = new Set(['ready', 'paused', 'completed', 'failed']);

export function ResearchMissionDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [busy, setBusy] = useState(false);

  const { result: missionRes, query: missionQuery } = useList<Row<ResearchMissionJsonld>>({
    resource: 'research_missions',
    filters: id ? [{ field: 'id', operator: 'eq', value: id }] : [],
    pagination: { currentPage: 1, pageSize: 1 },
    queryOptions: { enabled: Boolean(id) },
  });
  const mission = missionRes?.data?.[0];
  const missionIri = mission?.['@id'];

  const { result: messagesRes } = useList<Row<MissionMessageJsonld>>({
    resource: 'research_mission_messages',
    filters: missionIri ? [{ field: 'mission', operator: 'eq', value: missionIri }] : [],
    sorters: [{ field: 'createdAt', order: 'asc' }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(missionIri) },
  });
  const messages = messagesRes?.data ?? [];

  const { result: leadsRes, query: leadsQuery } = useList<Row<LeadJsonld>>({
    resource: 'leads',
    filters: missionIri ? [{ field: 'mission', operator: 'eq', value: missionIri }] : [],
    sorters: [{ field: 'fitScore', order: 'desc' }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(missionIri) },
  });
  const leads = leadsRes?.data ?? [];

  // Best-effort live refresh of leads while a run is in flight.
  useLiveResource('leads');

  const onRun = async () => {
    if (!mission?.id) return;
    setBusy(true);
    try {
      await researchMission.run(mission.id);
      toast.success(t('toast.search_started_run'));
      window.setTimeout(() => {
        void missionQuery.refetch();
        void leadsQuery.refetch();
      }, 1500);
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Start nicht möglich (externe Suche/Egress prüfen).'));
    } finally {
      setBusy(false);
    }
  };

  if (missionQuery.isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!mission) {
    return <p className="text-sm text-destructive">Mission nicht gefunden.</p>;
  }

  const brief = mission.brief ?? {};
  const briefEntries = Object.entries(brief).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/research/missions">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h2 className="text-xl line-clamp-1">{mission.prompt}</h2>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {OBJECTIVE_LABEL[mission.objective] ? t(OBJECTIVE_LABEL[mission.objective]) : mission.objective}
              </Badge>
              <Badge variant={MISSION_STATUS_VARIANT[mission.status] ?? 'outline'} className="text-xs">
                {MISSION_STATUS_LABEL[mission.status] ? t(MISSION_STATUS_LABEL[mission.status]) : mission.status}
              </Badge>
            </div>
          </div>
        </div>
        {CAN_RUN.has(mission.status) ? (
          <Button onClick={() => void onRun()} disabled={busy}>
            <Play className="size-4" /> Suche starten
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Auftrag</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {mission.summary ? <p className="text-muted-foreground">{mission.summary}</p> : null}
            <div>
              <span className="text-muted-foreground">Gefunden: </span>
              {mission.foundCount ?? 0}
              {mission.targetCount ? ` / ${mission.targetCount}` : ''}
            </div>
            {briefEntries.length ? (
              <div className="space-y-1">
                <p className="font-medium">Brief</p>
                {briefEntries.map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <span className="text-muted-foreground">{k}: </span>
                    {Array.isArray(v) ? v.join(', ') : String(v)}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {messages.length ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Dialog</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {messages.map((m) => (
                <div key={m['@id']} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className="mt-1 shrink-0 rounded-full bg-muted p-1.5">
                    {m.role === 'agent' ? <Bot className="size-4" /> : <UserIcon className="size-4" />}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Leads ({leads.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <LeadsTable leads={leads} onChanged={() => void leadsQuery.refetch()} />
        </CardContent>
      </Card>
    </div>
  );
}
