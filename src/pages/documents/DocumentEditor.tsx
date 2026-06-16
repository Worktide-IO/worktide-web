import { useInvalidate, useOne } from '@refinedev/core';
import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import '@blocknote/shadcn/style.css';
import { History, Loader2, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { DocumentJsonld } from '@/api/types/document/Jsonld';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DocumentHistoryDrawer } from './DocumentHistoryDrawer';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';

type Props = {
  documentId: string;
  onRenamed?: () => void;
  onDeleted?: () => void;
};

const schema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
});

/**
 * Top-level wrapper — fetches the document and only mounts the inner
 * editor body once we have its content. This is critical: BlockNote's
 * `useCreateBlockNote` only honours its `initialContent` argument once
 * (on mount); creating the editor before the body arrives would lock
 * us to an empty paragraph forever.
 */
export function DocumentEditor({ documentId, onRenamed, onDeleted }: Props) {
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
    />
  );
}

function EditorBody({
  doc,
  documentId,
  onRenamed,
  onDeleted,
}: {
  doc: Row<DocumentJsonld>;
  documentId: string;
  onRenamed?: () => void;
  onDeleted?: () => void;
}) {
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
      toast.error('Konnte Inhalt nicht speichern.');
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
      toast.error('Konnte Titel nicht speichern.');
    } finally {
      setSavingTitle(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Seite wirklich löschen?')) return;
    try {
      await api.delete(`/documents/${documentId}`);
      onDeleted?.();
    } catch {
      toast.error('Konnte Seite nicht löschen.');
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
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {savingTitle || savingBody ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              Speichere…
            </span>
          ) : (
            <span>gespeichert</span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setHistoryOpen(true)}
            aria-label="Versionsverlauf"
            title="Versionsverlauf"
          >
            <History className="size-4 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={remove} aria-label="Löschen">
            <Trash2 className="size-4 text-muted-foreground" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <BlockNoteView editor={editor} theme="light" />
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

