import { Check, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { aiErrorMessage, aiEstimate, aiTriage, type AiRecommendation } from '@/lib/ai';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { useMercureTopic } from '@/lib/mercure';

type Props = {
  taskId?: string | null;
  /** Called after the estimate is accepted, so the parent can refetch the task. */
  onApplied?: () => void;
};

const RESULT_FALLBACK_MS = 12000; // safety re-fetch if the Mercure ping is missed

/** Whole minutes → a compact "3 h 30 min" / "45 min" string. */
function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return min > 0 ? `${h} h ${min} min` : `${h} h`;
  return `${min} min`;
}

/**
 * On-demand AI effort estimate for a task, human-in-the-loop. Mirrors
 * {@see AiTriagePanel}: a button queues an estimate; a Mercure ping on the
 * workspace topic triggers a re-fetch (with a delayed fallback). The pending
 * recommendation shows the suggested duration + how many past tasks informed it;
 * accept sets Task.estimatedMinutes, reject dismisses it. Nothing changes until
 * accept.
 */
export function AiEstimatePanel({ taskId, onApplied }: Props) {
  const { t } = useTranslation();
  const [reco, setReco] = useState<AiRecommendation | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const refetch = useCallback(async (): Promise<AiRecommendation | null> => {
    if (!taskId) return null;
    const r = await aiTriage.fetchPending('task', taskId, 'estimate').catch(() => null);
    setReco(r);
    if (r) setLoading(false);
    return r;
  }, [taskId]);

  useEffect(() => {
    let active = true;
    if (!taskId) return;
    void aiTriage.fetchPending('task', taskId, 'estimate').then((r) => {
      if (active) {
        setReco(r);
        if (r) setLoading(false);
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [taskId]);

  const workspaceId = readAuth(WORKSPACE_STORAGE_KEY);
  const topic = workspaceId ? `worktide:workspace:${workspaceId}:ai-recommendations` : null;
  useMercureTopic<{ targetId?: string }>(topic, {
    enabled: Boolean(topic && taskId),
    onMessage: (msg) => {
      if (!taskId || msg.data?.targetId === taskId) void refetch();
    },
  });

  const request = async () => {
    if (!taskId) return;
    setLoading(true);
    try {
      await aiEstimate.request(taskId);
      toast.info(t('toast.ai_analysis_started'));
      window.setTimeout(() => {
        void refetch().then((r) => {
          if (!r) setLoading(false);
        });
      }, RESULT_FALLBACK_MS);
    } catch (err) {
      setLoading(false);
      toast.error(aiErrorMessage(err, t('toast.ai_analysis_failed')));
    }
  };

  const accept = async () => {
    if (!reco) return;
    setBusy(true);
    try {
      await aiTriage.accept(reco.id);
      toast.success(t('toast.suggestion_adopted'));
      setReco(null);
      onApplied?.();
    } catch (err) {
      toast.error(aiErrorMessage(err, t('toast.could_not_adopt_suggestion')));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reco) return;
    setBusy(true);
    try {
      await aiTriage.reject(reco.id);
      toast.success(t('toast.suggestion_dismissed'));
      setReco(null);
    } catch (err) {
      toast.error(aiErrorMessage(err, t('toast.could_not_dismiss_suggestion')));
    } finally {
      setBusy(false);
    }
  };

  if (!taskId) return null;

  const minutes = reco?.suggestion.estimatedMinutes ?? null;

  if (!reco || minutes === null) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void request()}
        disabled={loading}
        className="h-7 gap-1.5 text-xs"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
        {loading ? t('ai_estimate.analyzing') : t('ai_estimate.trigger')}
      </Button>
    );
  }

  const sample = reco.suggestion.sampleSize ?? 0;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <Clock className="size-4 text-indigo-500" />
        <span className="text-sm font-medium">{t('ai_estimate.suggestion_title')}</span>
        {reco.model ? (
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">{reco.model}</Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums">{formatMinutes(minutes)}</span>
          <span className="text-xs text-muted-foreground">
            {sample > 0 ? t('ai_estimate.based_on', { count: sample }) : t('ai_estimate.no_history')}
          </span>
        </div>

        {reco.reasoning ? <p className="text-xs italic text-muted-foreground">{reco.reasoning}</p> : null}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={() => void accept()} disabled={busy} className="h-7 gap-1.5 text-xs">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {t('ai_estimate.accept')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void reject()} disabled={busy} className="h-7 gap-1.5 text-xs">
            <X className="size-3.5" />
            {t('ai_estimate.reject')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void request()}
            disabled={busy || loading}
            className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground"
            title={t('ai_estimate.reanalyze')}
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
