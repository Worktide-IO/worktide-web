import { Check, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { aiErrorMessage, aiTriage, type AiRecommendation, type AiTriageTarget } from '@/lib/ai';

type Props = {
  target: AiTriageTarget;
  targetId?: string | null;
  /** Called after a suggestion is accepted, so the parent can refetch the ticket. */
  onApplied?: () => void;
};

const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 12; // ~30s

/**
 * On-demand AI triage for a ticket (Task or Conversation), human-in-the-loop.
 *
 * A "KI-Triage" button queues a suggestion on the backend; the result arrives
 * as a Pending AIRecommendation which we poll for and render as a card the user
 * can accept (applies tracker/priority/tags or conversation status + adds an
 * internal summary note) or reject. Nothing on the ticket changes until accept.
 */
export function AiTriagePanel({ target, targetId, onApplied }: Props) {
  const [reco, setReco] = useState<AiRecommendation | null>(null);
  const [loading, setLoading] = useState(false); // triage requested, awaiting result
  const [busy, setBusy] = useState(false); // accept/reject in flight
  const pollRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refetch = useCallback(async (): Promise<AiRecommendation | null> => {
    if (!targetId) return null;
    const r = await aiTriage.fetchPending(target, targetId).catch(() => null);
    setReco(r);
    return r;
  }, [target, targetId]);

  useEffect(() => {
    void refetch();
    return () => stopPolling();
  }, [refetch, stopPolling]);

  const requestTriage = async () => {
    if (!targetId) return;
    setLoading(true);
    try {
      await aiTriage.request(target, targetId);
      toast.info('KI-Analyse gestartet …');

      let attempts = 0;
      stopPolling();
      pollRef.current = window.setInterval(() => {
        void (async () => {
          attempts += 1;
          const r = await refetch();
          if (r || attempts >= POLL_MAX_ATTEMPTS) {
            stopPolling();
            setLoading(false);
            if (!r) {
              toast.warning('Noch kein Ergebnis — läuft der ai_agents-Worker?');
            }
          }
        })();
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setLoading(false);
      toast.error(aiErrorMessage(err, 'KI-Analyse konnte nicht gestartet werden.'));
    }
  };

  const accept = async () => {
    if (!reco) return;
    setBusy(true);
    try {
      await aiTriage.accept(reco.id);
      toast.success('Vorschlag übernommen.');
      setReco(null);
      onApplied?.();
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Konnte Vorschlag nicht übernehmen.'));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!reco) return;
    setBusy(true);
    try {
      await aiTriage.reject(reco.id);
      toast.success('Vorschlag verworfen.');
      setReco(null);
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Konnte Vorschlag nicht verwerfen.'));
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
