import { useGetIdentity, useInvalidate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, Send, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useUserDirectory, userDisplayName } from '@/hooks/useUserDirectory';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type WorkflowState = 'draft' | 'review' | 'published';

type Props = {
  documentId: string;
  state: WorkflowState;
  reviewers: string[];
  submittedBy?: string | null;
  publishedBy?: string | null;
};

const STATE_BADGE: Record<WorkflowState, { label: string; classes: string }> = {
  draft: {
    label: 'doc_state.draft',
    classes:
      'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  },
  review: {
    label: 'doc_state.review',
    classes:
      'border-violet-300 bg-violet-50 text-violet-800 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-200',
  },
  published: {
    label: 'doc_state.published',
    classes:
      'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
  },
};

/**
 * Workflow controls for a Document. Renders the current state as a
 * coloured pill plus context-appropriate actions:
 *
 *   draft     → "Zur Prüfung einreichen" with reviewer picker
 *   review    → "Freigeben" + "Änderungen anfordern" (only for
 *                listed reviewers; backend enforces — we just hide
 *                the buttons for non-reviewers to keep the UI quiet)
 *   published → just the badge (a save sends it back to draft)
 *
 * State and reviewers are passed in so the parent stays the source
 * of truth; this component only fires the action and triggers a
 * cache invalidation on the document.
 */
export function DocumentWorkflowPanel({
  documentId,
  state,
  reviewers,
  submittedBy: _submittedBy,
  publishedBy: _publishedBy,
}: Props) {
  const { t } = useTranslation();
  const { data: identity } = useGetIdentity<{ id?: string }>();
  const me = identity?.id ? `/v1/users/${identity.id}` : null;
  const isReviewer = me ? reviewers.includes(me) : false;
  const badge = STATE_BADGE[state];

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
          badge.classes,
        )}
        title={`Workflow: ${t(badge.label)}`}
      >
        {t(badge.label)}
      </span>
      {state === 'draft' ? (
        <SubmitForReviewButton documentId={documentId} initialReviewers={reviewers} />
      ) : null}
      {state === 'review' && isReviewer ? (
        <ReviewActions documentId={documentId} />
      ) : null}
      {state === 'review' && !isReviewer ? (
        <ReviewerChips reviewers={reviewers} />
      ) : null}
    </div>
  );
}

function ReviewerChips({ reviewers }: { reviewers: string[] }) {
  const { byIri } = useUserDirectory();
  if (reviewers.length === 0) return null;
  return (
    <span className="text-xs text-muted-foreground">
      Wartet auf:{' '}
      {reviewers
        .map((iri) => {
          const u = byIri[iri];
          return u ? userDisplayName(u) : 'Unbekannt';
        })
        .join(', ')}
    </span>
  );
}

function SubmitForReviewButton({
  documentId,
  initialReviewers,
}: {
  documentId: string;
  initialReviewers: string[];
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const { users } = useUserDirectory();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(initialReviewers);
  const [busy, setBusy] = useState(false);

  const userList = useMemo(() => users, [users]);

  async function submit() {
    if (selected.length === 0) {
      toast.error(t('toast.min_one_reviewer'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/submit`, {
        reviewers: selected,
      });
      toast.success(t('toast.submitted'));
      setOpen(false);
      void invalidate({ resource: 'documents', invalidates: ['detail', 'list'], id: documentId });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? t('toast.could_not_submit'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1">
          <Send className="size-3" />
          Zur Prüfung einreichen
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Reviewer wählen
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-between">
              <span className="truncate">
                {selected.length === 0
                  ? 'Niemand ausgewählt'
                  : `${selected.length} ausgewählt`}
              </span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-64 overflow-y-auto">
            <DropdownMenuLabel>Workspace-Mitglieder</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {userList.map((u) => {
              const iri = `/v1/users/${u.id}`;
              const checked = selected.includes(iri);
              return (
                <DropdownMenuCheckboxItem
                  key={u.id}
                  checked={checked}
                  onCheckedChange={(c) => {
                    setSelected((s) =>
                      c ? [...s, iri] : s.filter((x) => x !== iri),
                    );
                  }}
                >
                  <Avatar className="mr-2 size-5">
                    <AvatarFallback className="text-[10px]">
                      {(userDisplayName(u) || '?').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  {userDisplayName(u)}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={submit} disabled={busy}>
            Einreichen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReviewActions({ documentId }: { documentId: string }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/approve`, {});
      toast.success(t('toast.approved'));
      void invalidate({ resource: 'documents', invalidates: ['detail', 'list'], id: documentId });
      void qc.invalidateQueries({ queryKey: ['document-backlinks', documentId] });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? t('toast.approval_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function requestChanges() {
    if (note.trim() === '') {
      toast.error(t('toast.describe_change'));
      return;
    }
    setBusy(true);
    try {
      await api.post(`/documents/${documentId}/request-changes`, { note });
      toast.success(t('toast.changes_requested'));
      setRejecting(false);
      setNote('');
      void invalidate({ resource: 'documents', invalidates: ['detail', 'list'], id: documentId });
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? t('toast.request_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-950"
        onClick={approve}
        disabled={busy}
      >
        <CheckCircle2 className="size-3" />
        Freigeben
      </Button>
      <Popover open={rejecting} onOpenChange={setRejecting}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950"
            disabled={busy}
          >
            <XCircle className="size-3" />
            Änderungen anfordern
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Was soll geändert werden?
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Bitte konkret beschreiben — der Autor sieht diese Notiz."
            className="h-24 text-sm"
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRejecting(false)}>
              Abbrechen
            </Button>
            <Button size="sm" onClick={requestChanges} disabled={busy}>
              Absenden
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
