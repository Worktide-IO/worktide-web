import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  File as FileIcon,
  FileAudio,
  FileText,
  FileVideo,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createFolder,
  deleteFile,
  deleteFolder,
  downloadFile,
  fetchFileObjectUrl,
  fileKind,
  isImage,
  isViewable,
  listFiles,
  listFolders,
  moveFile,
  moveFolder,
  renameFolder,
  setHidden,
  uploadFile,
  type FileNode,
  type FolderNode,
} from '@/lib/files';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type Crumb = { id: string; name: string; iri: string };
type NameDialog = { mode: 'create' } | { mode: 'rename'; id: string; current: string };
type DeleteTarget = { kind: 'folder' | 'file'; id: string; name: string };
type DragItem = { kind: 'folder' | 'file'; id: string; iri: string; name: string };

/** Highlight key for the root drop zone (the "Files" breadcrumb) — folder IRIs never collide with it. */
const ROOT_DROP = '__root__';

function formatSize(size: number | string | null | undefined): string {
  const n = typeof size === 'string' ? Number(size) : (size ?? 0);
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Nextcloud-like file manager for a customer: breadcrumb navigation, folder
 * create/rename/delete (recursive), file upload/download/delete, and a per-item
 * "visible in portal" toggle (isHiddenForConnectUsers). The whole area is the
 * space shared with the customer; hiding an item keeps it staff-only.
 */
export function CustomerFilesTab({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [path, setPath] = useState<Crumb[]>([]);
  const [folders, setFolders] = useState<FolderNode[]>([]);
  const [files, setFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nameDialog, setNameDialog] = useState<NameDialog | null>(null);
  const [nameValue, setNameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<DeleteTarget | null>(null);
  // Drag & drop: `drag` is the item being moved internally; `dropTarget` is the
  // highlighted drop zone key; `uploadHover` shows the OS-file upload overlay.
  const [drag, setDrag] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [uploadHover, setUploadHover] = useState(false);
  // Object URLs for previewable media (fileId → blob URL), fetched authenticated
  // and reused for the list thumbnail and the viewer. `viewer` is the index into
  // the current folder's viewable-media list, or null when closed. The ref
  // mirrors the map so we can revoke every blob (image thumbs + lazily-loaded
  // audio/video) when the folder changes.
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<number | null>(null);
  const urlCacheRef = useRef<Map<string, string>>(new Map());

  const currentIri = path.length > 0 ? path[path.length - 1].iri : null;

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : null;
  })();

  // No synchronous setState here (would trip react-hooks/set-state-in-effect);
  // initial `loading=true` covers first paint, later navigations refetch in place.
  const reload = useCallback(async () => {
    try {
      const [f, fi] = await Promise.all([
        listFolders(customerId, currentIri),
        listFiles(customerId, currentIri),
      ]);
      setFolders(f);
      setFiles(fi);
    } catch {
      toast.error(t('customer_files.load_failed'));
    } finally {
      setLoading(false);
    }
  }, [customerId, currentIri, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load folder contents on mount + on navigation
    void reload();
  }, [reload]);

  // Fetch a file's bytes as an object URL once and cache it (by id). Reused for
  // the list thumbnail and the viewer; a concurrent duplicate is revoked.
  const loadUrl = useCallback(async (id: string) => {
    if (urlCacheRef.current.has(id)) return;
    const url = await fetchFileObjectUrl(id);
    if (urlCacheRef.current.has(id)) {
      URL.revokeObjectURL(url);
      return;
    }
    urlCacheRef.current.set(id, url);
    setMediaUrls((prev) => ({ ...prev, [id]: url }));
  }, []);

  // Revoke every cached blob when the folder changes (or on unmount) so nothing
  // leaks across navigation. Runs before the loaders below re-populate.
  useEffect(() => {
    const cache = urlCacheRef.current;
    return () => {
      for (const url of cache.values()) URL.revokeObjectURL(url);
      cache.clear();
      setMediaUrls({});
    };
  }, [currentIri]);

  // Eagerly load image thumbnails for the current listing (keyed on the image id
  // set so renames/hide-toggles/moves don't refetch). Audio/video are loaded
  // lazily by the viewer instead — their blobs can be large.
  const imageIdsKey = files.filter((f) => isImage(f.mimeType)).map((f) => f.id).join(',');
  useEffect(() => {
    if (imageIdsKey === '') return;
    let cancelled = false;
    void (async () => {
      for (const id of imageIdsKey.split(',')) {
        if (cancelled) return;
        try {
          await loadUrl(id);
        } catch {
          // A single failed preview shouldn't break the listing.
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageIdsKey, loadUrl]);

  const openFolder = (f: FolderNode) => setPath((p) => [...p, { id: f.id, name: f.name, iri: f['@id'] }]);
  const goTo = (index: number) => setPath((p) => (index < 0 ? [] : p.slice(0, index + 1)));

  const submitName = async () => {
    const name = nameValue.trim();
    if (!name || !nameDialog) return;
    setBusy(true);
    try {
      if (nameDialog.mode === 'create') {
        if (!workspaceIri) {
          toast.error(t('toast.workspace_not_found'));
          return;
        }
        await createFolder(customerId, workspaceIri, name, currentIri);
        toast.success(t('customer_files.folder_created'));
      } else {
        await renameFolder(nameDialog.id, name);
        toast.success(t('customer_files.renamed'));
      }
      setNameDialog(null);
      setNameValue('');
      await reload();
    } catch {
      toast.error(t('customer_files.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  const onFilesPicked = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        await uploadFile(customerId, currentIri, file);
      }
      toast.success(t('customer_files.uploaded', { n: list.length }));
      await reload();
    } catch {
      toast.error(t('customer_files.upload_failed'));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      if (confirmDelete.kind === 'folder') {
        await deleteFolder(confirmDelete.id);
      } else {
        await deleteFile(confirmDelete.id);
      }
      toast.success(t('customer_files.deleted'));
      setConfirmDelete(null);
      await reload();
    } catch {
      toast.error(t('customer_files.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  const toggleHidden = async (kind: 'folders' | 'files', id: string, hidden: boolean) => {
    try {
      await setHidden(kind, id, hidden);
      await reload();
    } catch {
      toast.error(t('customer_files.action_failed'));
    }
  };

  /**
   * Move the item currently being dragged into `targetIri` (null = root). Cycles
   * are prevented by the tree view itself — a folder's descendants are never
   * visible at the same level — so we only guard the drop-onto-itself no-op.
   */
  const moveInto = async (targetIri: string | null) => {
    const item = drag;
    setDrag(null);
    setDropTarget(null);
    if (!item) return;
    if (item.kind === 'folder' && item.iri === targetIri) return;
    setBusy(true);
    try {
      if (item.kind === 'folder') {
        await moveFolder(item.id, targetIri);
      } else {
        await moveFile(item.id, targetIri);
      }
      toast.success(t('customer_files.moved', { name: item.name }));
      await reload();
    } catch {
      toast.error(t('customer_files.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  const empty = folders.length === 0 && files.length === 0;
  // Viewable media (image/audio/video) in listing order — the viewer steps
  // through exactly these.
  const media = files.filter((f) => isViewable(f.mimeType));

  // Lazily load the currently-shown media item (audio/video aren't prefetched).
  const viewerId = viewer !== null ? media[viewer]?.id : undefined;
  useEffect(() => {
    if (viewerId) void loadUrl(viewerId);
  }, [viewerId, loadUrl]);

  /**
   * Open a file the way its type warrants: previewable media in the viewer,
   * PDFs in a new tab, everything else downloads.
   */
  const openFile = (f: FileNode) => {
    const kind = fileKind(f.mimeType);
    if (kind === 'pdf') {
      // Open a tab synchronously (avoids the popup blocker), then point it at
      // the fetched blob — a plain href wouldn't carry the JWT. Not cached/
      // revoked: the tab owns the blob until it's closed.
      const win = window.open('', '_blank');
      void fetchFileObjectUrl(f.id)
        .then((url) => {
          if (win) win.location.href = url;
          else window.open(url, '_blank');
        })
        .catch(() => {
          win?.close();
          toast.error(t('customer_files.action_failed'));
        });
      return;
    }
    if (kind === 'other') {
      void downloadFile(f.id, f.name);
      return;
    }
    const idx = media.findIndex((m) => m.id === f.id);
    if (idx >= 0) setViewer(idx);
  };

  return (
    <Card
      className="relative"
      // OS-file drag from the desktop → upload into the current folder. Internal
      // moves carry a `drag` item and are handled per row/crumb, so ignore those.
      onDragOver={(e) => {
        if (drag || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setUploadHover(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setUploadHover(false);
      }}
      onDrop={(e) => {
        if (drag || !e.dataTransfer.files?.length) return;
        e.preventDefault();
        setUploadHover(false);
        void onFilesPicked(e.dataTransfer.files);
      }}
    >
      <CardHeader className="gap-3">
        {/* Breadcrumb (each crumb is a drop target to move items up the tree) */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => goTo(-1)}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropTarget(ROOT_DROP);
            }}
            onDragLeave={() => setDropTarget((cur) => (cur === ROOT_DROP ? null : cur))}
            onDrop={(e) => {
              if (!drag) return;
              e.preventDefault();
              void moveInto(null);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded px-1 hover:text-foreground',
              dropTarget === ROOT_DROP && 'bg-accent text-foreground ring-1 ring-primary/40',
            )}
          >
            <Home className="size-3.5" /> {t('customer_files.root')}
          </button>
          {path.map((crumb, i) => (
            <span key={crumb.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5" />
              <button
                type="button"
                onClick={() => goTo(i)}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTarget(crumb.iri);
                }}
                onDragLeave={() => setDropTarget((cur) => (cur === crumb.iri ? null : cur))}
                onDrop={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  void moveInto(crumb.iri);
                }}
                className={cn(
                  'hover:text-foreground max-w-40 truncate rounded px-1',
                  dropTarget === crumb.iri && 'bg-accent text-foreground ring-1 ring-primary/40',
                )}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </div>
        {/* Toolbar */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setNameValue('');
              setNameDialog({ mode: 'create' });
            }}
          >
            <FolderPlus className="size-4" /> {t('customer_files.new_folder')}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t('customer_files.upload')}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => void onFilesPicked(e.target.files)}
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : empty ? (
          <p className="text-center text-sm text-muted-foreground py-10">
            {t('customer_files.empty')}
          </p>
        ) : (
          <div className="divide-y">
            {folders.map((f) => (
              <div
                key={f['@id']}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', f.name);
                  setDrag({ kind: 'folder', id: f.id, iri: f['@id'], name: f.name });
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setDropTarget(null);
                }}
                onDragOver={(e) => {
                  // Only internal moves land on a folder row, and never onto itself.
                  if (!drag || (drag.kind === 'folder' && drag.iri === f['@id'])) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  setDropTarget(f['@id']);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                  setDropTarget((cur) => (cur === f['@id'] ? null : cur));
                }}
                onDrop={(e) => {
                  if (!drag || (drag.kind === 'folder' && drag.iri === f['@id'])) return;
                  e.preventDefault();
                  e.stopPropagation();
                  void moveInto(f['@id']);
                }}
                className={cn(
                  'flex items-center gap-3 rounded-md py-2',
                  dropTarget === f['@id'] && 'bg-accent ring-1 ring-primary/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => openFolder(f)}
                  className="flex flex-1 items-center gap-3 text-left hover:underline"
                >
                  <FolderIcon className="size-5 text-sky-500" />
                  <span className="font-medium">{f.name}</span>
                  {f.isHiddenForConnectUsers ? (
                    <EyeOff className="size-3.5 text-muted-foreground" />
                  ) : null}
                </button>
                <RowMenu
                  hidden={!!f.isHiddenForConnectUsers}
                  onRename={() => {
                    setNameValue(f.name);
                    setNameDialog({ mode: 'rename', id: f.id, current: f.name });
                  }}
                  onDelete={() => setConfirmDelete({ kind: 'folder', id: f.id, name: f.name })}
                  onToggleHidden={() => toggleHidden('folders', f.id, !f.isHiddenForConnectUsers)}
                  t={t}
                />
              </div>
            ))}
            {files.map((f) => (
              <div
                key={f['@id']}
                draggable={!busy}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'move';
                  e.dataTransfer.setData('text/plain', f.name);
                  setDrag({ kind: 'file', id: f.id, iri: f['@id'], name: f.name });
                }}
                onDragEnd={() => {
                  setDrag(null);
                  setDropTarget(null);
                }}
                className="flex items-center gap-3 py-2"
              >
                <button
                  type="button"
                  onClick={() => openFile(f)}
                  className="group flex flex-1 items-center gap-3 text-left"
                >
                  {isImage(f.mimeType) ? (
                    <span className="relative size-9 shrink-0 overflow-hidden rounded border bg-muted">
                      {mediaUrls[f.id] ? (
                        <img
                          src={mediaUrls[f.id]}
                          alt={f.name}
                          className="size-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <Loader2 className="absolute inset-0 m-auto size-4 animate-spin text-muted-foreground" />
                      )}
                    </span>
                  ) : (
                    <FileKindIcon mimeType={f.mimeType} />
                  )}
                  <span className="truncate group-hover:underline">{f.name}</span>
                  {f.isHiddenForConnectUsers ? (
                    <EyeOff className="size-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                </button>
                <span className="text-xs tabular-nums text-muted-foreground">{formatSize(f.size)}</span>
                <RowMenu
                  isFile
                  hidden={!!f.isHiddenForConnectUsers}
                  onDownload={() => void downloadFile(f.id, f.name)}
                  onDelete={() => setConfirmDelete({ kind: 'file', id: f.id, name: f.name })}
                  onToggleHidden={() => toggleHidden('files', f.id, !f.isHiddenForConnectUsers)}
                  t={t}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* OS-file drop overlay (only while dragging files in from the desktop) */}
      {uploadHover ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Upload className="size-5" /> {t('customer_files.drop_to_upload')}
          </div>
        </div>
      ) : null}

      {/* Create / rename folder dialog */}
      <Dialog open={nameDialog !== null} onOpenChange={(o) => !o && setNameDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {nameDialog?.mode === 'rename'
                ? t('customer_files.rename_folder')
                : t('customer_files.new_folder')}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameValue}
            placeholder={t('customer_files.folder_name')}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitName();
            }}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNameDialog(null)}>
              {t('action.cancel')}
            </Button>
            <Button type="button" disabled={busy || nameValue.trim() === ''} onClick={() => void submitName()}>
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete !== null} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('customer_files.confirm_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete?.kind === 'folder'
                ? t('customer_files.confirm_delete_folder', { name: confirmDelete?.name })
                : t('customer_files.confirm_delete_file', { name: confirmDelete?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('action.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doDelete()}>
              {t('action.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Media viewer (images, audio, video) */}
      {viewer !== null && media[viewer] ? (
        <MediaViewer
          items={media}
          index={viewer}
          urls={mediaUrls}
          onNavigate={setViewer}
          onClose={() => setViewer(null)}
          onDownload={(item) => void downloadFile(item.id, item.name)}
          t={t}
        />
      ) : null}
    </Card>
  );
}

function RowMenu({
  isFile,
  hidden,
  onDownload,
  onRename,
  onDelete,
  onToggleHidden,
  t,
}: {
  isFile?: boolean;
  hidden: boolean;
  onDownload?: () => void;
  onRename?: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  t: (key: string) => string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-7">
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isFile && onDownload ? (
          <DropdownMenuItem onClick={onDownload}>
            <Download className="size-4" /> {t('customer_files.download')}
          </DropdownMenuItem>
        ) : null}
        {onRename ? (
          <DropdownMenuItem onClick={onRename}>
            <Pencil className="size-4" /> {t('customer_files.rename')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onToggleHidden}>
          {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {hidden ? t('customer_files.show_in_portal') : t('customer_files.hide_from_portal')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-4" /> {t('action.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Type icon for non-image files in the listing. */
function FileKindIcon({ mimeType }: { mimeType: string | null | undefined }) {
  const kind = fileKind(mimeType);
  if (kind === 'audio') return <FileAudio className="size-5 shrink-0 text-violet-500" />;
  if (kind === 'video') return <FileVideo className="size-5 shrink-0 text-rose-500" />;
  if (kind === 'pdf') return <FileText className="size-5 shrink-0 text-red-500" />;
  return <FileIcon className="size-5 shrink-0 text-muted-foreground" />;
}

/**
 * Full-screen media viewer for images, audio and video. Steps through the
 * folder's viewable media with the arrow buttons or ←/→ keys (wrapping around),
 * closes on Escape or a backdrop click.
 */
function MediaViewer({
  items,
  index,
  urls,
  onNavigate,
  onClose,
  onDownload,
  t,
}: {
  items: FileNode[];
  index: number;
  urls: Record<string, string>;
  onNavigate: (index: number) => void;
  onClose: () => void;
  onDownload: (item: FileNode) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const count = items.length;
  const current = items[index];
  const url = current ? urls[current.id] : undefined;
  const kind = current ? fileKind(current.mimeType) : 'other';

  const go = useCallback(
    (delta: number) => onNavigate((index + delta + count) % count),
    [index, count, onNavigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 p-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate text-sm">
          {current?.name}
          {count > 1 ? (
            <span className="ml-2 text-white/60">
              {index + 1} / {count}
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          {current ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white"
              onClick={() => onDownload(current)}
              title={t('customer_files.download')}
            >
              <Download className="size-5" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={onClose}
            title={t('action.close')}
          >
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {/* Image stage */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {count > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute left-2 size-11 rounded-full text-white hover:bg-white/10 hover:text-white"
            onClick={() => go(-1)}
            title={t('customer_files.prev_image')}
          >
            <ChevronLeft className="size-7" />
          </Button>
        ) : null}
        {!url ? (
          <Loader2 className="size-8 animate-spin text-white/70" />
        ) : kind === 'video' ? (
          <video src={url} controls autoPlay className="max-h-full max-w-full" />
        ) : kind === 'audio' ? (
          <div className="flex w-full max-w-lg flex-col items-center gap-4 px-6 text-white">
            <FileAudio className="size-16 text-white/70" />
            <audio src={url} controls autoPlay className="w-full" />
          </div>
        ) : (
          <img
            src={url}
            alt={current?.name}
            className="max-h-full max-w-full object-contain"
          />
        )}
        {count > 1 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-2 size-11 rounded-full text-white hover:bg-white/10 hover:text-white"
            onClick={() => go(1)}
            title={t('customer_files.next_image')}
          >
            <ChevronRight className="size-7" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
