import { useList } from '@refinedev/core';
import { History, Loader2, RotateCcw, User as UserIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserDirectory, userDisplayName } from '@/hooks/useUserDirectory';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

type RevisionRow = {
  '@id'?: string;
  id?: string | null;
  name?: string;
  body?: string | null;
  bodyFormat?: 'markdown' | 'html' | 'richtext';
  author?: string | null;
  createdAt?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  onRestored: () => void;
};

/**
 * Slide-over showing every revision of the document, newest first.
 * Click a revision to load its preview pane on the right; "Diese
 * Version wiederherstellen" POSTs the restore endpoint which copies
 * name + body back onto the live document (which the listener in turn
 * snapshots as its own new revision — restore is reversible).
 *
 * The preview deliberately renders the JSON body as plain pre-text
 * rather than mounting a second BlockNote editor: we want fidelity
 * (was this version really what I want back?), not editing. A future
 * iteration can do a side-by-side diff once we have a JSON-block diff
 * helper.
 */
export function DocumentHistoryDrawer({ open, onOpenChange, documentId, onRestored }: Props) {
  const documentIri = `/v1/documents/${documentId}`;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const { result: revisions, query } = useList<Row<RevisionRow>>({
    resource: 'document_revisions',
    pagination: { mode: 'off' },
    filters: [{ field: 'document', operator: 'eq', value: documentIri }],
    sorters: [{ field: 'createdAt', order: 'desc' }],
    queryOptions: { enabled: open },
  });

  const rows = revisions?.data ?? [];

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? rows[0] ?? null,
    [rows, selectedId],
  );

  const restore = async () => {
    if (!selected?.id) return;
    if (!window.confirm(`Diese Version wiederherstellen? Der aktuelle Stand wird als neue Revision gesichert.`)) {
      return;
    }
    setRestoring(true);
    try {
      await api.post(`/documents/${documentId}/restore`, {
        revision: `/v1/document_revisions/${selected.id}`,
      });
      toast.success('Version wiederhergestellt.');
      onRestored();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte nicht wiederherstellen.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:!max-w-4xl overflow-hidden p-0">
        <SheetHeader className="flex-row items-center gap-3 border-b px-6 py-3">
          <History className="size-5 text-muted-foreground" />
          <SheetTitle>Versionsverlauf</SheetTitle>
        </SheetHeader>
        <div className="grid h-[calc(100vh-4rem)] grid-cols-[18rem_1fr] overflow-hidden">
          <div className="overflow-y-auto border-r">
            {query.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                Noch keine Versionen.
              </p>
            ) : (
              <ul>
                {rows.map((r, i) => (
                  <RevisionRowItem
                    key={r['@id']}
                    rev={r}
                    isLatest={i === 0}
                    active={r.id === selected?.id}
                    onClick={() => r.id && setSelectedId(r.id)}
                  />
                ))}
              </ul>
            )}
          </div>
          <div className="flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex items-center justify-between border-b px-6 py-3">
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-semibold">{selected.name ?? 'Untitled'}</h3>
                    <p className="text-xs text-muted-foreground">
                      {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : '—'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={restore}
                    disabled={restoring}
                  >
                    {restoring ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
                    Diese Version wiederherstellen
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto bg-muted/20 p-6">
                  <BodyPreview body={selected.body} format={selected.bodyFormat ?? 'richtext'} />
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                Wähle links eine Version aus.
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RevisionRowItem({
  rev,
  isLatest,
  active,
  onClick,
}: {
  rev: Row<RevisionRow>;
  isLatest: boolean;
  active: boolean;
  onClick: () => void;
}) {
  const { byIri } = useUserDirectory();
  const author = rev.author ? byIri[rev.author] : null;
  return (
    <li
      onClick={onClick}
      className={cn(
        'cursor-pointer border-b px-3 py-2 text-sm hover:bg-muted',
        active && 'bg-muted',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{rev.name || 'Untitled'}</span>
        {isLatest ? (
          <Badge variant="secondary" className="text-[10px]">aktuell</Badge>
        ) : null}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <UserIcon className="size-3" />
        <span className="truncate">
          {author ? userDisplayName(author) : 'Unbekannt'}
        </span>
        <span className="ml-auto">
          {rev.createdAt ? new Date(rev.createdAt).toLocaleString() : '—'}
        </span>
      </div>
    </li>
  );
}

function BodyPreview({ body, format }: { body: string | null | undefined; format: string }) {
  if (!body) return <p className="text-xs italic text-muted-foreground">— leer —</p>;
  if (format === 'richtext') {
    try {
      const blocks = JSON.parse(body);
      // Render a flattened text preview — blocks → text content.
      const flat = flattenBlocks(blocks);
      return (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{flat}</div>
      );
    } catch {
      // fall through to raw display
    }
  }
  return <pre className="overflow-x-auto whitespace-pre-wrap text-xs">{body}</pre>;
}

/**
 * Walks BlockNote's nested block JSON and emits a plain-text shape
 * that's good enough for "what did this version contain" without
 * mounting a full editor instance.
 */
function flattenBlocks(blocks: unknown): string {
  if (!Array.isArray(blocks)) return '';
  const lines: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;
    const b = block as { type?: string; content?: unknown; children?: unknown };
    let line = '';
    if (Array.isArray(b.content)) {
      for (const c of b.content) {
        if (c && typeof c === 'object' && typeof (c as { text?: string }).text === 'string') {
          line += (c as { text: string }).text;
        }
      }
    } else if (typeof b.content === 'string') {
      line = b.content;
    }
    // Prefix by block type so the user sees structure at a glance.
    const prefix =
      b.type === 'heading' ? '# ' :
      b.type === 'bulletListItem' ? '• ' :
      b.type === 'numberedListItem' ? '1. ' :
      b.type === 'checkListItem' ? '☐ ' :
      b.type === 'quote' ? '> ' :
      b.type === 'codeBlock' ? '```\n' : '';
    const suffix = b.type === 'codeBlock' ? '\n```' : '';
    lines.push(prefix + line + suffix);
    if (Array.isArray(b.children) && b.children.length > 0) {
      const childText = flattenBlocks(b.children);
      if (childText) lines.push(childText.split('\n').map((l) => '  ' + l).join('\n'));
    }
  }
  return lines.join('\n');
}
