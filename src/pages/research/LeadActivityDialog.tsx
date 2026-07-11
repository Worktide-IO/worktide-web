import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { aiErrorMessage } from '@/lib/ai';
import type { Row } from '@/lib/refine';
import {
  LEAD_ACTIVITY_LABEL,
  LEAD_STAGE_LABEL,
  leadActivities,
  type LeadActivityJsonld,
  type LeadJsonld,
  type LeadStage,
} from '@/lib/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

const ICON: Record<string, typeof FileText> = {
  discovered: Sparkles,
  enriched: Sparkles,
  stage_change: ArrowRight,
  email_sent: Mail,
  reply: Mail,
  forum_post: MessageSquare,
  call: Phone,
  note: FileText,
};

/**
 * Per-lead activity timeline (append-only touchpoint history the agent and
 * pipeline actions write) plus a box to add a manual note. Controlled by the
 * caller: pass the lead to open, `null` to close.
 */
export function LeadActivityDialog({
  lead,
  onClose,
}: {
  lead: Row<LeadJsonld> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const leadIri = lead?.['@id'];

  const { result, query } = useList<Row<LeadActivityJsonld>>({
    resource: 'lead_activities',
    filters: leadIri ? [{ field: 'lead', operator: 'eq', value: leadIri }] : [],
    sorters: [{ field: 'occurredAt', order: 'desc' }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(leadIri) },
  });
  const activities = result?.data ?? [];

  const addNote = async () => {
    if (!leadIri || note.trim() === '') return;
    setBusy(true);
    try {
      await leadActivities.addNote(leadIri, note.trim());
      setNote('');
      await query.refetch();
    } catch (err) {
      toast.error(aiErrorMessage(err, t('toast.note_save_failed')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={lead !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4" /> {t('lead_activity.title', { name: lead?.name ?? '' })}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {query.isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('lead_activity.empty')}</p>
          ) : (
            activities.map((a) => {
              const Icon = ICON[a.type] ?? FileText;
              return (
                <div key={a['@id']} className="flex gap-3">
                  <div className="mt-0.5 shrink-0 rounded-full bg-muted p-1.5">
                    <Icon className="size-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {LEAD_ACTIVITY_LABEL[a.type] ? t(LEAD_ACTIVITY_LABEL[a.type]) : a.type}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDate(a.occurredAt)}</span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{summarize(a, t)}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-end gap-2 border-t pt-3">
          <Textarea
            rows={2}
            placeholder={t('lead_activity.note_placeholder')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button onClick={() => void addNote()} disabled={busy || note.trim() === ''}>
            <Send className="size-4" /> {t('lead_activity.add_note')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Human one-liner from the activity's payload/outcome. */
function summarize(a: Row<LeadActivityJsonld>, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case 'stage_change': {
      const fromKey = LEAD_STAGE_LABEL[String(p.from) as LeadStage];
      const from = fromKey ? t(fromKey) : String(p.from ?? '?');
      const toKey = LEAD_STAGE_LABEL[String(p.to) as LeadStage];
      const to = toKey ? t(toKey) : String(p.to ?? '?');
      return `${from} → ${to}`;
    }
    case 'discovered':
      return typeof p.provider === 'string' && p.provider !== '' ? t('lead_activity.found_via', { provider: p.provider }) : t('lead_activity.found');
    case 'note':
      return String(p.note ?? a.outcome ?? '');
    default:
      return a.outcome ?? (typeof p.note === 'string' ? p.note : '');
  }
}
