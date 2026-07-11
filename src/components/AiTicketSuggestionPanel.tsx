import { Check, Loader2, Sparkles, Ticket, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ProjectCombobox } from '@/components/ProjectCombobox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { aiErrorMessage, aiTriage, type AiRecommendation } from '@/lib/ai';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { useMercureTopic } from '@/lib/mercure';

type Props = {
  conversationId?: string | null;
  /** Called after a ticket is created, so the parent can refetch the conversation. */
  onApplied?: () => void;
};

const RESULT_FALLBACK_MS = 12000; // safety re-fetch if the Mercure ping is missed
const KIND = 'ticket_from_conversation';

/**
 * Human-in-the-loop "create a ticket from this conversation?" card. A pending
 * {@see AIRecommendation} of kind ticket_from_conversation renders as a card with
 * the AI's title/summary and a project picker (pre-filled with the suggested
 * project); accepting creates the Task, rejecting dismisses it. When no
 * suggestion exists a button requests one on demand (auto-suggest only fires for
 * live shared mailboxes on the backend). Live-updated via the workspace Mercure
 * ping, same as AiTriagePanel.
 */
export function AiTicketSuggestionPanel({ conversationId, onApplied }: Props) {
  const { t } = useTranslation();
  const [reco, setReco] = useState<AiRecommendation | null>(null);
  const [loading, setLoading] = useState(false); // suggestion requested, awaiting result
  const [busy, setBusy] = useState(false); // accept/reject in flight
  const [projectIri, setProjectIri] = useState('');

  const apply = useCallback((r: AiRecommendation | null) => {
    setReco(r);
    if (r) {
      setLoading(false);
      const sp = r.suggestion?.suggestedProject;
      setProjectIri(sp ? `/v1/projects/${sp}` : '');
    }
  }, []);

  const refetch = useCallback(async (): Promise<AiRecommendation | null> => {
    if (!conversationId) return null;
    const r = await aiTriage.fetchPending('conversation', conversationId, KIND).catch(() => null);
    apply(r);
    return r;
  }, [conversationId, apply]);

  useEffect(() => {
    let active = true;
    if (!conversationId) return;
    void aiTriage
      .fetchPending('conversation', conversationId, KIND)
      .then((r) => {
        if (active) apply(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [conversationId, apply]);

  const workspaceId = readAuth(WORKSPACE_STORAGE_KEY);
  const topic = workspaceId ? `worktide:workspace:${workspaceId}:ai-recommendations` : null;
  useMercureTopic<{ targetId?: string }>(topic, {
    enabled: Boolean(topic && conversationId),
    onMessage: (msg) => {
      if (!conversationId || msg.data?.targetId === conversationId) void refetch();
    },
  });

  const requestSuggestion = async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      await aiTriage.suggestTicket(conversationId);
      toast.info(t('toast.ticket_suggestion_requested'));
      window.setTimeout(() => {
        void refetch().then((r) => {
          if (!r) setLoading(false);
        });
      }, RESULT_FALLBACK_MS);
    } catch (err) {
      setLoading(false);
      toast.error(aiErrorMessage(err, 'Ticketvorschlag konnte nicht angefordert werden.'));
    }
  };

  const accept = async () => {
    if (!reco) return;
    if (!projectIri) {
      toast.error(t('toast.select_project_first'));
      return;
    }
    setBusy(true);
    try {
      await aiTriage.accept(reco.id, projectIri);
      toast.success(t('toast.ticket_created'));
      setReco(null);
      onApplied?.();
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Ticket konnte nicht erstellt werden.'));
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
      toast.error(aiErrorMessage(err, 'Konnte Vorschlag nicht verwerfen.'));
    } finally {
      setBusy(false);
    }
  };

  if (!conversationId) return null;

  if (!reco) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => void requestSuggestion()}
        disabled={loading}
        className="h-7 gap-1.5 text-xs"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Ticket className="size-3.5" />}
        {loading ? 'Analysiere …' : 'Ticket vorschlagen'}
      </Button>
    );
  }

  const s = reco.suggestion;

  return (
    <Card className="border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20">
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
        <Sparkles className="size-4 text-emerald-500" />
        <span className="text-sm font-medium">Ticket aus Konversation?</span>
        {reco.model ? (
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            {reco.model}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {s.title ? <p className="text-sm font-medium">{s.title}</p> : null}
        {s.summary ? <p className="text-sm text-muted-foreground">{s.summary}</p> : null}
        {reco.reasoning ? <p className="text-xs italic text-muted-foreground">{reco.reasoning}</p> : null}

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">Projekt</span>
          <ProjectCombobox value={projectIri} onChange={setProjectIri} />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            onClick={() => void accept()}
            disabled={busy || !projectIri}
            className="h-7 gap-1.5 text-xs"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Ticket anlegen
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
        </div>
      </CardContent>
    </Card>
  );
}
