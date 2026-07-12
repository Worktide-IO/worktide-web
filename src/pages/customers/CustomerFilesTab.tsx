import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  File as FileIcon,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createFolder,
  deleteFile,
  deleteFolder,
  downloadFile,
  listFiles,
  listFolders,
  renameFolder,
  setHidden,
  uploadFile,
  type FileNode,
  type FolderNode,
} from '@/lib/files';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
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

  const empty = folders.length === 0 && files.length === 0;

  return (
    <Card>
      <CardHeader className="gap-3">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => goTo(-1)}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Home className="size-3.5" /> {t('customer_files.root')}
          </button>
          {path.map((crumb, i) => (
            <span key={crumb.id} className="inline-flex items-center gap-1">
              <ChevronRight className="size-3.5" />
              <button
                type="button"
                onClick={() => goTo(i)}
                className="hover:text-foreground max-w-40 truncate"
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
              <div key={f['@id']} className="flex items-center gap-3 py-2">
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
              <div key={f['@id']} className="flex items-center gap-3 py-2">
                <div className="flex flex-1 items-center gap-3">
                  <FileIcon className="size-5 text-muted-foreground" />
                  <span>{f.name}</span>
                  {f.isHiddenForConnectUsers ? (
                    <EyeOff className="size-3.5 text-muted-foreground" />
                  ) : null}
                </div>
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
