import { useList, useCreate, useUpdate, useDelete } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import {
  Bookmark,
  Copy,
  Database,
  ExternalLink,
  FolderSync,
  FolderUp,
  Globe,
  Loader2,
  Monitor,
  Pencil,
  Plus,
  Terminal,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

// Manual type until Kubb codegen picks up the new entity
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type { Row } from '@/lib/refine';

type BookmarkRow = Row<{ '@id'?: string; id?: string; label: string; type: string; host: string; port?: number | null; connectConfig?: Record<string, unknown>; notes?: string | null; isEnabled: boolean; isShared: boolean; portalVisible: boolean; customer?: string | null; system?: string | null }>;

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  web: Globe,
  ssh: Terminal,
  sftp: FolderSync,
  ftp: FolderUp,
  rdp: Monitor,
  vnc: Monitor,
  database: Database,
};

const TYPE_OPTIONS = [
  { value: 'web', label: 'Web / Admin-URL' },
  { value: 'ssh', label: 'SSH' },
  { value: 'sftp', label: 'SFTP' },
  { value: 'ftp', label: 'FTP / FTPS' },
  { value: 'rdp', label: 'Remote Desktop (RDP)' },
  { value: 'vnc', label: 'VNC' },
  { value: 'database', label: 'Datenbank' },
];

function buildUrl(b: BookmarkRow): string | null {
  const host = b.host ?? '';
  const port = b.port ?? null;
  const cfg = (b.connectConfig ?? {}) as Record<string, unknown>;
  switch (b.type) {
    case 'web':
      return String(cfg.url ?? host ?? '');
    case 'ssh':
      return host ? `ssh://${host}${port ? `:${port}` : ''}` : null;
    case 'sftp':
      return host ? `sftp://${host}${port ? `:${port}` : ''}${cfg.remotePath ?? ''}` : null;
    case 'ftp':
      return host ? `ftp://${host}${port ? `:${port}` : ''}${cfg.remotePath ?? ''}` : null;
    case 'rdp':
      return host ? `rdp://${host}${port ? `:${port}` : ''}` : null;
    case 'vnc':
      return host ? `vnc://${host}${port ? `:${port}` : ''}` : null;
    case 'database':
      return host ? `${cfg.database ?? ''}` : null;
    default:
      return null;
  }
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
  toast.success('Kopiert');
}

type DialogMode = { mode: 'create' } | { mode: 'edit'; bookmark: BookmarkRow } | null;

export function CustomerBookmarksTab({ customerIri }: { customerIri: string }) {
  const { t } = useTranslation();
  const [dialog, setDialog] = useState<DialogMode>(null);
  const { result, query } = useList<BookmarkRow>({
    resource: 'customer_bookmarks',
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    pagination: { mode: 'off' },
    sorters: [{ field: 'type', order: 'asc' }],
  });
  const { mutate: remove } = useDelete<BookmarkRow>();
  const bookmarks = result?.data ?? [];

  if (query.isLoading) {
    return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t('nav.customer_bookmarks')}
        </span>
        <Button type="button" size="sm" onClick={() => setDialog({ mode: 'create' })} className="gap-1.5">
          <Plus className="size-3.5" /> {t('action.add')}
        </Button>
      </div>

      {bookmarks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('customer_bookmarks.empty')}</p>
      ) : (
        <div className="space-y-2">
          {bookmarks.map((b) => {
            const Icon = TYPE_ICONS[b.type ?? 'web'] ?? Globe;
            const url = buildUrl(b);
            const isWeb = b.type === 'web';
            return (
              <div
                key={b['@id']}
                className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30"
              >
                <Icon className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.label}</p>
                  {isWeb && url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs text-primary hover:underline"
                    >
                      {url}
                    </a>
                  ) : url ? (
                    <p className="truncate font-mono text-xs text-muted-foreground">{url}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {isWeb && url ? (
                    <Button type="button" variant="ghost" size="icon-sm" title={t('action.open')} onClick={() => window.open(url, '_blank')}>
                      <ExternalLink className="size-3.5" />
                    </Button>
                  ) : url ? (
                    <Button type="button" variant="ghost" size="icon-sm" title={t('action.copy')} onClick={() => void copyToClipboard(url)}>
                      <Copy className="size-3.5" />
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="icon-sm" onClick={() => setDialog({ mode: 'edit', bookmark: b })}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (b.id) remove({ resource: 'customer_bookmarks', id: b.id });
                    }}
                  >
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dialog ? (
        <BookmarkDialog
          mode={dialog.mode}
          bookmark={dialog.mode === 'edit' ? dialog.bookmark : undefined}
          customerIri={customerIri}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

function BookmarkDialog({
  mode,
  bookmark,
  customerIri,
  onClose,
}: {
  mode: 'create' | 'edit';
  bookmark?: BookmarkRow;
  customerIri: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { mutate: create, mutation: createMut } = useCreate<BookmarkRow>();
  const { mutate: update, mutation: updateMut } = useUpdate<BookmarkRow>();
  const busy = createMut.isPending || updateMut.isPending;

  const [label, setLabel] = useState(bookmark?.label ?? '');
  const [type, setType] = useState<string>(bookmark?.type ?? 'web');
  const [host, setHost] = useState(bookmark?.host ?? '');
  const [port, setPort] = useState(bookmark?.port != null ? String(bookmark.port) : '');
  const [url, setUrl] = useState<string>(() => {
    if (bookmark?.type === 'web' && bookmark?.connectConfig) {
      return String((bookmark.connectConfig as Record<string, unknown>).url ?? '');
    }
    return '';
  });
  const [database, setDatabase] = useState<string>(() => {
    if (bookmark?.type === 'database' && bookmark?.connectConfig) {
      return String((bookmark.connectConfig as Record<string, unknown>).database ?? '');
    }
    return '';
  });
  const [remotePath, setRemotePath] = useState<string>(() => {
    if ((bookmark?.type === 'sftp' || bookmark?.type === 'ftp') && bookmark?.connectConfig) {
      return String((bookmark.connectConfig as Record<string, unknown>).remotePath ?? '');
    }
    return '';
  });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [notes, setNotes] = useState(bookmark?.notes ?? '');

  const save = () => {
    const connectConfig: Record<string, string> = {};
    if (type === 'web') connectConfig.url = url;
    if (type === 'database') connectConfig.database = database;
    if (type === 'sftp' || type === 'ftp') connectConfig.remotePath = remotePath;

    const credentials: Record<string, string> = {};
    if (username) credentials.username = username;
    if (password) credentials.password = password;

    const body: Record<string, unknown> = {
      label,
      type,
      host,
      port: port !== '' ? Number(port) : null,
      connectConfig,
      credentials,
      notes,
      customer: customerIri,
    };

    if (mode === 'create') {
      create(
        { resource: 'customer_bookmarks', values: body },
        { onSuccess: () => { toast.success(t('toast.created')); onClose(); } },
      );
    } else if (bookmark?.id) {
      update(
        { resource: 'customer_bookmarks', id: bookmark.id, values: body },
        { onSuccess: () => { toast.success(t('toast.saved')); onClose(); } },
      );
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bookmark className="size-5" />
            {mode === 'create' ? t('customer_bookmarks.create') : t('customer_bookmarks.edit')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="bm-label">{t('customer_bookmarks.label')}</Label>
            <Input id="bm-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="z.B. TYPO3 Admin" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('customer_bookmarks.type')}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {type === 'web' ? (
            <div className="space-y-1.5">
              <Label htmlFor="bm-url">URL</Label>
              <Input id="bm-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="bm-host">{t('customer_bookmarks.host')}</Label>
                <Input id="bm-host" value={host} onChange={(e) => setHost(e.target.value)} placeholder="server.customer.de" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bm-port">{t('customer_bookmarks.port')}</Label>
                <Input id="bm-port" value={port} onChange={(e) => setPort(e.target.value)} placeholder="22" />
              </div>
            </div>
          )}
          {(type === 'sftp' || type === 'ftp') && (
            <div className="space-y-1.5">
              <Label htmlFor="bm-path">{t('customer_bookmarks.remote_path')}</Label>
              <Input id="bm-path" value={remotePath} onChange={(e) => setRemotePath(e.target.value)} placeholder="/var/www/html" />
            </div>
          )}
          {type === 'database' && (
            <div className="space-y-1.5">
              <Label htmlFor="bm-db">{t('customer_bookmarks.database')}</Label>
              <Input id="bm-db" value={database} onChange={(e) => setDatabase(e.target.value)} placeholder="db_name" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="bm-user">{t('customer_bookmarks.username')}</Label>
              <Input id="bm-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bm-pw">{t('customer_bookmarks.password')}</Label>
              <Input id="bm-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bm-notes">{t('customer_bookmarks.notes')}</Label>
            <Textarea id="bm-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
          <Button onClick={save} disabled={busy || !label.trim() || (!url && !host)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === 'create' ? t('action.create') : t('action.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
