import { useInvalidate, useOne } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useCreateBlockNote, SuggestionMenuController } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { History, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { DocumentJsonld } from '@/api/types/document/Jsonld';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserDirectory, userDisplayName } from '@/hooks/useUserDirectory';
import { DocumentBacklinksPanel } from './DocumentBacklinksPanel';
import { DocumentHistoryDrawer } from './DocumentHistoryDrawer';
import { DocumentWorkflowPanel } from './DocumentWorkflowPanel';
import { detectWorktideLink } from './linkCard';
import { documentSchema } from './mention';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';

type Props = {
  documentId: string;
  onRenamed?: () => void;
  onDeleted?: () => void;
  onNavigate?: (documentId: string) => void;
};

const schema = documentSchema;

/**
 * Top-level wrapper — fetches the document and only mounts the inner
 * editor body once we have its content. This is critical: BlockNote's
 * `useCreateBlockNote` only honours its `initialContent` argument once
 * (on mount); creating the editor before the body arrives would lock
 * us to an empty paragraph forever.
 */
export function DocumentEditor({ documentId, onRenamed, onDeleted, onNavigate }: Props) {
  const { result: doc, query } = useOne<Row<DocumentJsonld>>({
    resource: 'documents',
    id: documentId,
  });

  if (query.isLoading || !doc) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-5/6" />
      </div>
    );
  }
  return (
    <EditorBody
      key={documentId}
      doc={doc}
      documentId={documentId}
      onRenamed={onRenamed}
      onDeleted={onDeleted}
      onNavigate={onNavigate}
    />
  );
}

function EditorBody({
  doc,
  documentId,
  onRenamed,
  onDeleted,
  onNavigate,
}: {
  doc: Row<DocumentJsonld>;
  documentId: string;
  onRenamed?: () => void;
  onDeleted?: () => void;
  onNavigate?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [title, setTitle] = useState(doc.name ?? '');
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingBody, setSavingBody] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const bodyDebounce = useRef<number | null>(null);
  // Guard against the editor's first onChange (fired while applying
  // initialContent) overwriting persisted content with an empty doc.
  const initialApplied = useRef(false);
  const pendingPayload = useRef<string | null>(null);

  const initialBlocks = useMemo(() => {
    const raw = doc.body?.trim();
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      // Legacy markdown — leave undefined, user can re-type
    }
    return undefined;
  }, [doc]);

  const editor = useCreateBlockNote({
    schema,
    initialContent: initialBlocks ?? [{ type: 'paragraph' }],
  });

  // After mount, give BlockNote one tick to apply initialContent before
  // we listen for changes. Otherwise the first synthetic change event
  // races us and saves the placeholder.
  useEffect(() => {
    const t = window.setTimeout(() => {
      initialApplied.current = true;
    }, 200);
    return () => window.clearTimeout(t);
  }, []);

  // Paste-handler: if the user pastes plain text that looks like a
  // Worktide reference (URL, IRI, or task identifier like WORK-12),
  // intercept and insert a `linkcard` inline content instead of the
  // raw text. ProseMirror's view has its own paste-pipeline so we
  // hook on the `clipboardTextParser` slot.
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const view = (editor as any).prosemirrorView;
    if (!view) return;
    const dom = view.dom as HTMLElement;
    const onPaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const detected = detectWorktideLink(text);
      if (!detected) return;
      e.preventDefault();
      editor.insertInlineContent([
        {
          type: 'linkcard',
          props: { url: detected, fallback: detected },
        },
        ' ',
      ]);
    };
    dom.addEventListener('paste', onPaste);
    return () => dom.removeEventListener('paste', onPaste);
  }, [editor]);

  const persist = async (body: string) => {
    setSavingBody(true);
    try {
      await api.patch(
        `/documents/${documentId}`,
        { body, bodyFormat: 'richtext' },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      void invalidate({ resource: 'documents', invalidates: ['list'], id: documentId });
    } catch {
      toast.error(t('toast.could_not_save_content'));
    } finally {
      setSavingBody(false);
    }
  };

  useEffect(() => {
    const unsubscribe = editor.onChange(() => {
      if (!initialApplied.current) return;
      const json = JSON.stringify(editor.document);
      pendingPayload.current = json;
      if (bodyDebounce.current) window.clearTimeout(bodyDebounce.current);
      bodyDebounce.current = window.setTimeout(() => {
        if (pendingPayload.current !== null) {
          const p = pendingPayload.current;
          pendingPayload.current = null;
          void persist(p);
        }
      }, 1000);
    });
    return () => {
      unsubscribe?.();
      // Flush any pending save on unmount so a navigate-away doesn't
      // drop the last second of edits.
      if (bodyDebounce.current) {
        window.clearTimeout(bodyDebounce.current);
        if (pendingPayload.current !== null) {
          const p = pendingPayload.current;
          pendingPayload.current = null;
          void persist(p);
        }
      }
    };
    // editor is stable for this component instance (we key on documentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  const saveTitle = async () => {
    const trimmed = title.trim() || 'Untitled';
    if (trimmed === doc.name) return;
    setSavingTitle(true);
    try {
      await api.patch(
        `/documents/${documentId}`,
        { name: trimmed },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      void invalidate({ resource: 'documents', invalidates: ['list'], id: documentId });
      onRenamed?.();
    } catch {
      toast.error(t('toast.could_not_save_title'));
    } finally {
      setSavingTitle(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t('document_editor.confirm_delete'))) return;
    try {
      await api.delete(`/documents/${documentId}`);
      onDeleted?.();
    } catch {
      toast.error(t('toast.could_not_delete_page'));
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 border-b px-6 py-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="Untitled"
          className="border-none bg-transparent px-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
        />
        <DocumentWorkflowPanel
          documentId={documentId}
          state={((doc as unknown as { workflowState?: string }).workflowState ?? 'draft') as 'draft' | 'review' | 'published'}
          reviewers={((doc as unknown as { reviewers?: string[] }).reviewers) ?? []}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {savingTitle || savingBody ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              {t('document_editor.saving')}
            </span>
          ) : (
            <span>{t('document_editor.saved')}</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setHistoryOpen(true)}
            aria-label={t('document_editor.history')}
            title={t('document_editor.history')}
          >
            <History className="size-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={remove} aria-label={t('action.delete')}>
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <BlockNoteView editor={editor} theme="light">
          <MentionSuggestionController editor={editor} />
        </BlockNoteView>
        {onNavigate ? (
          <DocumentBacklinksPanel documentId={documentId} onOpen={onNavigate} />
        ) : null}
      </div>
      <DocumentHistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        documentId={documentId}
        onRestored={() => {
          setHistoryOpen(false);
          void invalidate({ resource: 'documents', invalidates: ['list', 'detail'], id: documentId });
          // Force a key-swap-style remount by reloading via the URL —
          // easier than fiddling with editor.replaceBlocks here.
          window.location.reload();
        }}
      />
    </>
  );
}

/**
 * Wires `@`-mentions into the editor. Typing `@` opens a floating
 * menu fed by the shared user directory; picking a user inserts a
 * `mention` inline-content block that the DocumentSchema renders as
 * a coloured chip. The chip stores both the user IRI and the
 * display-name-at-time-of-mention so deleted users still read
 * sensibly. Suggestions are filtered against the typed query
 * client-side — the user directory is small (workspace members) so
 * this never needs server-side search.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MentionSuggestionController({ editor }: { editor: any }) {
  const { users } = useUserDirectory();
  return (
    <SuggestionMenuController
      triggerCharacter="@"
      getItems={async (query) => {
        const q = (query ?? '').trim().toLowerCase();
        const matches = users
          .filter((u) => {
            if (!q) return true;
            const name = userDisplayName(u).toLowerCase();
            const mail = (u.email ?? '').toLowerCase();
            return name.includes(q) || mail.includes(q);
          })
          .slice(0, 8);
        return matches.map((u) => {
          const title = userDisplayName(u);
          const userIri = u['@id'] ?? '';
          return {
            title,
            subtext: u.email ?? undefined,
            onItemClick: () => {
              editor.insertInlineContent([
                {
                  type: 'mention',
                  props: { userIri, name: title },
                },
                ' ',
              ]);
            },
          };
        });
      }}
    />
  );
}

