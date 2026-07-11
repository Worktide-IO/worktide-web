import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderTree,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { DocumentJsonld } from '@/api/types/document/Jsonld';
import type { DocumentSpaceJsonld } from '@/api/types/documentSpace/Jsonld';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

import { DocumentEditor } from './DocumentEditor';

/**
 * /documents — Confluence-style two-pane:
 *   left  · Spaces tree (collapsible) + per-space page tree
 *   right · the picked document's editor (BlockNote, see DocumentEditor)
 *
 * Page selection lives in this component's state (not the URL) so a user
 * deep-linked into a page can copy a link later, but right now we keep
 * it simple. A future iteration can sync `/documents/:id` to the URL
 * so the page tree highlights it.
 */
export function DocumentsPage() {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const invalidate = useInvalidate();

  const workspaceId =
    typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const workspaceIri = workspaceId ? `/v1/workspaces/${workspaceId}` : null;

  const { result: spaces, query: spacesQuery } = useList<Row<DocumentSpaceJsonld>>({
    resource: 'document_spaces',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { result: documents, query: docsQuery } = useList<Row<DocumentJsonld>>({
    resource: 'documents',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  const docsBySpace = useMemo(() => {
    const m: Record<string, Row<DocumentJsonld>[]> = {};
    for (const d of documents?.data ?? []) {
      if (d.space && !d.parent && !d.project && !d.task) {
        (m[d.space] ??= []).push(d);
      }
    }
    return m;
  }, [documents]);

  const childrenByParent = useMemo(() => {
    const m: Record<string, Row<DocumentJsonld>[]> = {};
    for (const d of documents?.data ?? []) {
      if (d.parent) (m[d.parent] ??= []).push(d);
    }
    return m;
  }, [documents]);

  const refresh = () =>
    invalidate({ resource: 'documents', invalidates: ['list'] });

  const createPage = async (params: {
    spaceIri?: string;
    parentIri?: string;
    name?: string;
  }) => {
    if (!workspaceIri) {
      toast.error(t('toast.no_active_workspace'));
      return;
    }
    try {
      const { data } = await api.post<{ '@id'?: string; id?: string }>('/documents', {
        name: params.name?.trim() || 'Neue Seite',
        bodyFormat: 'richtext',
        space: params.spaceIri ?? null,
        parent: params.parentIri ?? null,
        workspace: workspaceIri,
      });
      await refresh();
      if (data.id) setActiveId(data.id);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.could_not_create_page'));
    }
  };

  const createSpace = async () => {
    const name = window.prompt('Name des neuen Spaces:');
    if (!name?.trim()) return;
    if (!workspaceIri) {
      toast.error(t('toast.no_active_workspace'));
      return;
    }
    try {
      await api.post('/document_spaces', {
        name: name.trim(),
        workspace: workspaceIri,
      });
      void invalidate({ resource: 'document_spaces', invalidates: ['list'] });
      toast.success(t('toast.space_created', { name: name.trim() }));
    } catch {
      toast.error(t('toast.could_not_create_space'));
    }
  };

  const deleteDoc = async (id: string) => {
    if (!window.confirm('Seite wirklich löschen? Inkl. aller Unterseiten.')) return;
    try {
      await api.delete(`/documents/${id}`);
      if (activeId === id) setActiveId(null);
      await refresh();
      toast.success(t('toast.deleted'));
    } catch {
      toast.error(t('toast.could_not_delete_page'));
    }
  };

  return (
    <div className="grid h-[calc(100vh-7rem)] grid-cols-[280px_1fr] gap-4 overflow-hidden">
      <aside className="flex h-full flex-col overflow-hidden rounded-lg border bg-muted/20">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <FolderTree className="size-4 text-muted-foreground" />
            Dokumente
          </h3>
          <Button variant="ghost" size="icon" className="size-7" onClick={createSpace}>
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {spacesQuery.isLoading || docsQuery.isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-6 w-5/6" />
            </div>
          ) : (spaces?.data ?? []).length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              Noch kein Space. Klick auf + um den ersten anzulegen.
            </p>
          ) : (
            (spaces?.data ?? []).map((s) => (
              <SpaceNode
                key={s['@id']}
                space={s}
                rootDocs={docsBySpace[s['@id'] ?? ''] ?? []}
                childrenByParent={childrenByParent}
                activeId={activeId}
                onActivate={(id) => setActiveId(id)}
                onAdd={(parentIri) =>
                  createPage(
                    parentIri
                      ? { parentIri, spaceIri: s['@id'] ?? undefined }
                      : { spaceIri: s['@id'] ?? undefined },
                  )
                }
                onDelete={deleteDoc}
              />
            ))
          )}
        </div>
      </aside>

      <section className="flex h-full flex-col overflow-hidden rounded-lg border">
        {activeId ? (
          <DocumentEditor
            documentId={activeId}
            onRenamed={refresh}
            onDeleted={() => {
              setActiveId(null);
              refresh();
            }}
            onNavigate={(id) => setActiveId(id)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
            <div className="space-y-2">
              <FileText className="mx-auto size-10 opacity-30" />
              <p>Wähle links eine Seite oder lege eine neue an.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function SpaceNode({
  space,
  rootDocs,
  childrenByParent,
  activeId,
  onActivate,
  onAdd,
  onDelete,
}: {
  space: Row<DocumentSpaceJsonld>;
  rootDocs: Row<DocumentJsonld>[];
  childrenByParent: Record<string, Row<DocumentJsonld>[]>;
  activeId: string | null;
  onActivate: (id: string) => void;
  onAdd: (parentIri?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="px-1 py-1">
      <div
        className="group flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {space.emoji ? <span>{space.emoji}</span> : <FileText className="size-3.5 text-muted-foreground" />}
        <span className="flex-1 truncate font-medium">{space.name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          aria-label="Neue Seite im Space"
        >
          <Plus className="size-3" />
        </Button>
      </div>
      {open ? (
        <div className="ml-3 border-l pl-1">
          {rootDocs.length === 0 ? (
            <p className="px-2 py-1 text-[11px] text-muted-foreground">— leer —</p>
          ) : (
            rootDocs.map((d) => (
              <DocNode
                key={d['@id']}
                doc={d}
                childrenByParent={childrenByParent}
                activeId={activeId}
                depth={0}
                onActivate={onActivate}
                onAdd={onAdd}
                onDelete={onDelete}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function DocNode({
  doc,
  childrenByParent,
  activeId,
  depth,
  onActivate,
  onAdd,
  onDelete,
}: {
  doc: Row<DocumentJsonld>;
  childrenByParent: Record<string, Row<DocumentJsonld>[]>;
  activeId: string | null;
  depth: number;
  onActivate: (id: string) => void;
  onAdd: (parentIri?: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const kids = doc['@id'] ? childrenByParent[doc['@id']] ?? [] : [];
  const isActive = doc.id != null && doc.id === activeId;

  return (
    <div className="select-none">
      <div
        className={cn(
          'group flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-sm hover:bg-muted',
          isActive && 'bg-muted font-medium',
        )}
        onClick={() => doc.id && onActivate(doc.id)}
        style={{ paddingLeft: 6 + depth * 8 }}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="text-muted-foreground"
            aria-label={open ? 'Einklappen' : 'Ausklappen'}
          >
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        {doc.emoji ? <span>{doc.emoji}</span> : <FileText className="size-3 text-muted-foreground" />}
        <span className="flex-1 truncate">{doc.name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            if (doc['@id']) onAdd(doc['@id']);
          }}
          aria-label="Subseite anlegen"
        >
          <Plus className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            if (doc.id) onDelete(doc.id);
          }}
          aria-label="Löschen"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {open && kids.length > 0 ? (
        <div>
          {kids.map((c) => (
            <DocNode
              key={c['@id']}
              doc={c}
              childrenByParent={childrenByParent}
              activeId={activeId}
              depth={depth + 1}
              onActivate={onActivate}
              onAdd={onAdd}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
