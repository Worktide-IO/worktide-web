import { CalendarClock, CalendarPlus, CircleSlash, HeartPulse, Loader2, Mail, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/intl';
import { aiErrorMessage } from '@/lib/ai';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type AffectedCustomer = {
  customerId: string;
  customerName: string;
  recipient: string | null;
  tasks: { id: string; title: string; startOn: string | null }[];
};
type IntakeResponse =
  | { status: 'clarify'; question: string }
  | { status: 'created'; startsOn: string; endsOn: string; affected: AffectedCustomer[] };

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

/** One row from GET /v1/dashboard/my-schedule (planned tickets first). */
type ScheduledTicket = {
  id: string;
  identifier: string;
  title: string;
  priority: string;
  estimatedMinutes: number | null;
  dueOn: string | null;
  startOn: string | null;
  scheduledEnd: string | null;
  project: { id: string; name: string } | null;
};

const KEY = ['dashboard', 'my-schedule'] as const;
const REPLAN_REFETCH_MS = 13000; // LLM plan runs async; refetch once it should be ready

/**
 * "Meine Planung" — the caller's next open tickets in AI-planned order (from
 * /v1/dashboard/my-schedule). "Neu planen" queues the LLM work planner
 * (POST /v1/me/ai-plan), which distributes the tickets across the next 14 days
 * of free capacity and writes the time slots; the widget refetches once it lands.
 */
export function MyScheduleWidget() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [planning, setPlanning] = useState(false);
  const [absenceText, setAbsenceText] = useState('');
  const [absenceBusy, setAbsenceBusy] = useState(false);
  const [clarify, setClarify] = useState<string | null>(null);
  const [affected, setAffected] = useState<AffectedCustomer[] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get('/dashboard/my-schedule', { params: { limit: 7 } }).then((r) => r.data.tickets as ScheduledTicket[]),
  });

  async function replan() {
    setPlanning(true);
    try {
      await api.post('/me/ai-plan');
      toast.info(t('widget.my_schedule.planning_started'));
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: KEY });
        setPlanning(false);
      }, REPLAN_REFETCH_MS);
    } catch (err) {
      setPlanning(false);
      toast.error(aiErrorMessage(err, t('widget.my_schedule.planning_failed')));
    }
  }

  // Free-text absence intake → the AI parses it (may ask back), records the
  // absence, re-plans, and returns the customer-facing tickets in the window.
  async function reportAbsence() {
    const text = absenceText.trim();
    if (!text) return;
    setAbsenceBusy(true);
    setClarify(null);
    try {
      const { data: res } = await api.post<IntakeResponse>('/me/absence-intake', { text });
      if (res.status === 'clarify') {
        setClarify(res.question);
      } else {
        setAffected(res.affected);
        setAbsenceText('');
        toast.success(t('widget.my_schedule.absence_recorded'));
        // Re-plan runs async; refetch the schedule once it should be applied.
        window.setTimeout(() => void qc.invalidateQueries({ queryKey: KEY }), REPLAN_REFETCH_MS);
      }
    } catch (err) {
      toast.error(aiErrorMessage(err, t('widget.my_schedule.absence_failed')));
    } finally {
      setAbsenceBusy(false);
    }
  }

  async function notifyCustomers() {
    if (!affected) return;
    const taskIds = affected.flatMap((c) => c.tasks.map((task) => task.id));
    if (taskIds.length === 0) return;
    setAbsenceBusy(true);
    try {
      const { data: res } = await api.post<{ drafted: { created: boolean }[] }>('/me/absence-notify', { taskIds });
      const created = res.drafted.filter((d) => d.created).length;
      toast.success(t('widget.my_schedule.notify_done', { count: created }));
      setAffected(null);
    } catch (err) {
      toast.error(aiErrorMessage(err, t('widget.my_schedule.notify_failed')));
    } finally {
      setAbsenceBusy(false);
    }
  }

  // Manual plan tweaks: shift a ticket a day later, or drop it from the plan
  // (clear its slot) — written straight to the task via the API-Platform PATCH.
  const [adjustId, setAdjustId] = useState<string | null>(null);
  async function adjust(ticket: ScheduledTicket, mode: 'later' | 'remove') {
    setAdjustId(ticket.id);
    try {
      let body: Record<string, string | null>;
      if (mode === 'remove') {
        body = { startOn: null, scheduledEnd: null };
      } else {
        const shift = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 86400000).toISOString() : null);
        body = { startOn: shift(ticket.startOn), scheduledEnd: shift(ticket.scheduledEnd) };
      }
      await api.patch(`/tasks/${ticket.id}`, body, { headers: { 'Content-Type': 'application/merge-patch+json' } });
      await qc.invalidateQueries({ queryKey: KEY });
    } catch (err) {
      toast.error(aiErrorMessage(err, t('toast.action_failed')));
    } finally {
      setAdjustId(null);
    }
  }

  const tickets = data ?? [];
  const notifiable = affected?.filter((c) => c.recipient !== null) ?? [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarClock className="size-4 text-muted-foreground" /> {t('widget.my_schedule.label')}
        </CardTitle>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={planning} onClick={() => void replan()}>
          {planning ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {planning ? t('widget.my_schedule.planning') : t('widget.my_schedule.replan')}
        </Button>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('widget.my_schedule.empty')}</p>
        ) : (
          <ol className="space-y-1.5">
            {tickets.map((ticket, i) => (
              <li key={ticket.id} className="flex items-start gap-2 rounded-md border border-border/60 p-2 text-sm">
                <span className="mt-0.5 w-4 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{ticket.title}</span>
                    <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'secondary'} className="shrink-0 text-[10px]">
                      {t(`priority.${ticket.priority}`)}
                    </Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    {ticket.project ? <span className="truncate">{ticket.project.name}</span> : null}
                    {ticket.startOn ? (
                      <span className="text-foreground/70">{formatDateTime(ticket.startOn, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    ) : (
                      <span>{t('widget.my_schedule.unplanned')}</span>
                    )}
                    {ticket.estimatedMinutes ? <span>· {ticket.estimatedMinutes} min</span> : null}
                    {ticket.dueOn ? <span>· {t('widget.my_schedule.due', { date: ticket.dueOn })}</span> : null}
                  </div>
                </div>
                {ticket.startOn ? (
                  <div className="flex shrink-0 flex-col gap-0.5">
                    <button
                      type="button"
                      title={t('widget.my_schedule.push_day')}
                      disabled={adjustId === ticket.id}
                      onClick={() => void adjust(ticket, 'later')}
                      className="text-muted-foreground/60 hover:text-foreground disabled:opacity-40"
                    >
                      {adjustId === ticket.id ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarPlus className="size-3.5" />}
                    </button>
                    <button
                      type="button"
                      title={t('widget.my_schedule.remove_from_plan')}
                      disabled={adjustId === ticket.id}
                      onClick={() => void adjust(ticket, 'remove')}
                      className="text-muted-foreground/60 hover:text-destructive disabled:opacity-40"
                    >
                      <CircleSlash className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {/* Absence intake: report sickness in free text; AI re-plans + offers to notify customers. */}
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          <div className="flex items-center gap-2">
            <HeartPulse className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={absenceText}
              onChange={(e) => setAbsenceText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void reportAbsence(); }}
              placeholder={t('widget.my_schedule.absence_placeholder')}
              disabled={absenceBusy}
              className="h-8 text-sm"
            />
            <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={absenceBusy || !absenceText.trim()} onClick={() => void reportAbsence()}>
              {absenceBusy ? <Loader2 className="size-3.5 animate-spin" /> : t('widget.my_schedule.absence_report')}
            </Button>
          </div>
          {clarify ? <p className="text-xs text-amber-600">{clarify}</p> : null}
          {affected && affected.length > 0 ? (
            <div className="rounded-md border border-border/60 bg-muted/40 p-2 text-xs">
              <p className="mb-1 text-muted-foreground">
                {t('widget.my_schedule.affected_intro', { count: affected.length })}
              </p>
              <ul className="mb-2 space-y-0.5">
                {affected.map((c) => (
                  <li key={c.customerId} className={c.recipient ? '' : 'text-muted-foreground/60'}>
                    {c.customerName} · {c.tasks.length}× {c.recipient ? '' : `(${t('widget.my_schedule.no_recipient')})`}
                  </li>
                ))}
              </ul>
              <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={absenceBusy || notifiable.length === 0} onClick={() => void notifyCustomers()}>
                <Mail className="size-3.5" /> {t('widget.my_schedule.notify_customers', { count: notifiable.length })}
              </Button>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
