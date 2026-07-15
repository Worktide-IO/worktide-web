import { Check, Inbox, Loader2, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Link } from 'react-router';

import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

const PRIORITY_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  low: 'outline',
  normal: 'secondary',
  high: 'default',
  urgent: 'destructive',
};

type Offer = {
  id: string;
  identifier: string;
  title: string;
  priority: string;
  requiredDiscipline: string | null;
  dueOn: string | null;
  project: { id: string; name: string } | null;
  customerName: string | null;
};
type OffersResponse = { discipline?: string; needsDiscipline?: boolean; offers: Offer[] };

const KEY = ['dashboard', 'task-offers'] as const;

/**
 * "Angebotene Tickets" — unassigned tickets whose required discipline matches
 * the caller's (from /v1/dashboard/task-offers). Claim assigns it + re-plans the
 * schedule (server-side); decline hides it for this user. Prompts to set a
 * discipline when none is configured.
 */
export function TaskOffersWidget() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: KEY,
    queryFn: () => api.get('/dashboard/task-offers').then((r) => r.data as OffersResponse),
  });

  async function act(offer: Offer, action: 'claim' | 'decline-offer') {
    setBusyId(offer.id);
    try {
      await api.post(`/tasks/${offer.id}/${action}`);
      toast.success(action === 'claim' ? t('widget.task_offers.claimed') : t('widget.task_offers.declined'));
      void qc.invalidateQueries({ queryKey: KEY });
      if (action === 'claim') void qc.invalidateQueries({ queryKey: ['dashboard', 'my-schedule'] });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.action_failed'));
      void qc.invalidateQueries({ queryKey: KEY });
    } finally {
      setBusyId(null);
    }
  }

  const offers = data?.offers ?? [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Inbox className="size-4 text-muted-foreground" /> {t('widget.task_offers.label')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : data?.needsDiscipline ? (
          <p className="text-sm text-muted-foreground">
            {t('widget.task_offers.needs_discipline')}{' '}
            <Link to="/settings/profile" className="text-primary hover:underline">{t('widget.task_offers.set_discipline')}</Link>
          </p>
        ) : offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('widget.task_offers.empty')}</p>
        ) : (
          <ul className="space-y-1.5">
            {offers.map((offer) => (
              <li key={offer.id} className="rounded-md border border-border/60 p-2 text-sm">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate font-medium">{offer.title}</span>
                  <Badge variant={PRIORITY_VARIANT[offer.priority] ?? 'secondary'} className="shrink-0 text-[10px]">
                    {t(`priority.${offer.priority}`)}
                  </Badge>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  {offer.customerName ? <span className="truncate">{offer.customerName}</span> : null}
                  {offer.project ? <span className="truncate">{offer.project.name}</span> : null}
                  {offer.dueOn ? <span>· {t('widget.task_offers.due', { date: offer.dueOn })}</span> : null}
                </div>
                <div className="mt-1.5 flex gap-2">
                  <Button size="sm" className="h-7 gap-1.5 text-xs" disabled={busyId === offer.id} onClick={() => void act(offer, 'claim')}>
                    {busyId === offer.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    {t('widget.task_offers.accept')}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" disabled={busyId === offer.id} onClick={() => void act(offer, 'decline-offer')}>
                    <X className="size-3.5" /> {t('widget.task_offers.decline')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
