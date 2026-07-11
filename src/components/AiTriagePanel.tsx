import { Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { aiErrorMessage, aiTriage, type AiRecommendation, type AiTriageTarget } from '@/lib/ai';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { useMercureTopic } from '@/lib/mercure';

type Props = {
  target: AiTriageTarget;
  targetId?: string | null;
  /** Called after a suggestion is accepted, so the parent can refetch the ticket. */
  onApplied?: () => void;
};

const RESULT_FALLBACK_MS = 12000; // safety re-fetch if the Mercure ping is missed

/**
 * On-demand AI triage for a ticket (Task or Conversation), human-in-the-loop.
 *
 * A "KI-Triage" button queues a suggestion on the backend; when the worker has
 * produced it, a minimal Mercure ping on the workspace topic triggers a re-fetch
 * (a single delayed re-fetch is kept as a fallback if the push is missed). The
 * Pending AIRecommendation renders as a card the user can accept (applies
 * tracker/priority/tags or conversation status + adds an internal summary note)
 * or reject. Nothing on the ticket changes until accept.
 */
export function AiTriagePanel({ target, targetId, onApplied }: Props) {
  const { t: translate } = useTranslation();
  const [reco, setReco] = useState<AiRecommendation | null>(null);
  const [loading, setLoading] = useState(false); // triage requested, awaiting result
  const [busy, setBusy] = useState(false); // accept/reject in flight

  const refetch = useCallback(async (): Promise<AiRecommendation | null> => {
    if (!targetId) return null;
    const r = await aiTriage.fetchPending(target, targetId, 'triage').catch(() => null);
    setReco(r);
    if (r) setLoading(false);
    return r;
  }, [target, targetId]);

  useEffect(() => {
    let active = true;
    if (!targetId) return;
    void aiTriage.fetchPending(target, targetId, 'triage').then((r) => {
      if (active) {
        setReco(r);
        if (r) setLoading(false);
      }
    }).catch(() => {});
    return () => {
      active = false;
    };
  }, [target, targetId]);

  // Live: the backend publishes a minimal ping to the workspace topic when a
  // recommendation lands; we re-fetch (content comes over the REST API, not the
  // hub). Same opaque topic string as the backend handler.
  const workspaceId = readAuth(WORKSPACE_STORAGE_KEY);
  const topic = workspaceId ? `worktide:workspace:${workspaceId}:ai-recommendations` : null;
  useMercureTopic<{ targetId?: string }>(topic, {
    enabled: Boolean(topic && targetId),
    onMessage: (msg) => {
      if (!targetId || msg.data?.targetId === targetId) void refetch();
    },
  });

  const requestTriage = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      await aiTriage.request(target, targetId);
      toast.info(translate('toast.ai_analysis_started'));
      // The Mercure ping normally delivers the result; this only catches a
      // missed push (e.g. hub outage) — the worker persists it regardless.
      window.setTimeout(() => {
        void refetch().then((r) => {
          if (!r) setLoading(false);
        });
      }, RESULT_FALLBACK_MS);
    } catch (err) {
      setLoading(false);
      toast.error(aiErrorMessage(err, translate('toast.ai_analysis_failed')));
    }
  };

  const accept = async () => {
    if (!reco) return;
    setBusy(true);
    try {
      await aiTriage.accept(reco.id);
      toast.success(translate('toast.suggestion_adopted'));
      setReco(null);
      onApplied?.();
    } catch (err) {
      toast.error(aiErrorMessage(err, translate('toast.could_not_adopt_suggestion')));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reco) return;
    setBusy(true);
    try {
      await aiTriage.reject(reco.id);
      toast.success(translate('toast.suggestion_dismissed'));
      setReco(null);
    } catch (err) {
      toast.error(aiErrorMessage(err, translate('toast.could_not_dismiss_suggestion')));
    } finally {
      setBusy(false);
    }
  };

  if (!targetId) return null;

  // No suggestion yet → just the trigger button.
  if (!reco) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void requestTriage()}
        disabled={loading}
        className="h-7 gap-1.5 text-xs"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {loading ? 'Analysiere …' : 'KI-Triage'}
      </Button>
    );
  }

  const s = reco.suggestion;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40 dark:border-indigo-900 dark:bg-indigo-950/20">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <Sparkles className="size-4 text-indigo-500" />
        <span className="text-sm font-medium">KI-Triage-Vorschlag</span>
        {reco.model ? (
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            {reco.model}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {s.summary ? <p className="text-sm">{s.summary}</p> : null}

        <div className="flex flex-wrap items-center gap-2">
          {target === 'task' ? (
            <>
              {s.tracker ? <Badge variant="secondary" className="text-[11px]">Tracker: {s.tracker}</Badge> : null}
              {s.priority ? <Badge variant="secondary" className="text-[11px]">Priorität: {s.priority}</Badge> : null}
              {(s.tags ?? []).map((t) => (
                <Badge key={t} variant="outline" className="text-[11px]">#{t}</Badge>
              ))}
            </>
          ) : (
            s.status ? <Badge variant="secondary" className="text-[11px]">Status: {s.status}</Badge> : null
          )}
        </div>

        {target === 'task' && (s.suggestedNewTags?.length ?? 0) > 0 ? (
          <p className="text-xs text-muted-foreground">
            Neue Tags vorgeschlagen (nicht automatisch angelegt): {s.suggestedNewTags!.join(', ')}
          </p>
        ) : null}

        {reco.reasoning ? (
          <p className="text-xs italic text-muted-foreground">{reco.reasoning}</p>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={() => void accept()} disabled={busy} className="h-7 gap-1.5 text-xs">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Übernehmen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void reject()}
            disabled={busy}
            className="h-7 gap-1.5 text-xs"
          >
            <X className="size-3.5" />
            Verwerfen
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void requestTriage()}
            disabled={busy || loading}
            className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground"
            title="Neu analysieren"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
