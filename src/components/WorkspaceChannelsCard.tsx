import { useInvalidate, useList } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Link2, Loader2, Mailbox, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ChannelJsonld } from '@/api/types/channel/Jsonld';
import { ChannelVisibilityFields, type ChannelVisibility } from '@/components/ChannelVisibilityFields';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

const ADAPTER_PROVIDER_LABEL: Record<string, string> = {
  email_graph: 'adapter_provider.email_graph',
  email_gmail: 'adapter_provider.email_gmail',
};

/**
 * Helper for the two OAuth-flavoured adapters. The channel has to be
 * SAVED first (we need a real channel UUID to put in the OAuth state
 * blob); only then does the "Mit ... anmelden" button appear.
 *
 * Clicking the button asks the backend for the provider authorize URL
 * and redirects the top-level window. After provider consent the
 * callback at /v1/channels/oauth/callback bounces the user back to
 * /inbox?oauth=ok|err.
 */
function OAuthConnectBlock({ channelId, adapterCode, hasToken }: { channelId: string | null; adapterCode: string; hasToken: boolean }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const providerLabel = ADAPTER_PROVIDER_LABEL[adapterCode] ? t(ADAPTER_PROVIDER_LABEL[adapterCode]) : 'Provider';
  const startConnect = async () => {
    if (!channelId) {
      toast.error(t('toast.save_channel_before_oauth'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.get<{ authorizeUrl: string }>(`/channels/${channelId}/oauth/start`);
      window.location.href = data.authorizeUrl;
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.could_not_start_oauth'));
      setBusy(false);
    }
  };
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">OAuth</legend>
      <p className="text-xs text-muted-foreground">
        {t('ws_channels.oauth_hint', { provider: providerLabel })}
      </p>
      {hasToken ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="mr-1 inline size-4" />
          {t('ws_channels.oauth_connected')}
        </div>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t('ws_channels.oauth_not_connected')}
        </div>
      )}
      <Button
        size="sm"
        type="button"
        variant="outline"
        className="w-full"
        onClick={startConnect}
        disabled={busy || !channelId}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
        {hasToken ? t('ws_channels.oauth_reconnect', { provider: providerLabel }) : t('ws_channels.oauth_connect', { provider: providerLabel })}
      </Button>
    </fieldset>
  );
}

const ADAPTER_LABEL: Record<string, string> = {
  email_imap: 'adapter.email_imap',
  email_graph: 'adapter.email_graph',
  email_gmail: 'adapter.email_gmail',
};

/**
 * Workspace-Settings card for Channel CRUD — mailboxes today, slack /
 * zabbix / sms in later phases drop in here without UI surgery.
 *
 * The dialog renders an adapter-specific config sub-form. Today we
 * only ship `email_imap`; the OAuth flows for `email_graph` and
 * `email_gmail` (Phase C.5) replace the auth-config fields with a
 * "Mit Microsoft anmelden" button while the inbound/outbound config
 * stays similar.
 *
 * Auth-config writes through the libsodium-encrypting Doctrine
 * listener — the SPA sees and sends cleartext, the DB never holds it.
 */
export function WorkspaceChannelsCard() {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<Row<ChannelJsonld> | null>(null);
  const [creating, setCreating] = useState(false);

  const { result, query } = useList<Row<ChannelJsonld>>({
    resource: 'channels',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const channels = result?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mailbox className="size-5 text-muted-foreground" />
          Channels
        </CardTitle>
        <CardDescription>
          {t('ws_channels.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('ws_channels.new_channel')}
          </Button>
        </div>

        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : channels.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('ws_channels.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>{t('ws_channels.col_name_address')}</TableHead>
                <TableHead className="w-44">{t('ws_channels.col_type')}</TableHead>
                <TableHead className="w-32">Capabilities</TableHead>
                <TableHead className="w-44">{t('ws_channels.col_last_sync')}</TableHead>
                <TableHead className="w-20 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {channels.map((c) => (
                <ChannelRow key={c['@id']} channel={c} onEdit={() => setEditing(c)} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {creating ? <ChannelDialog mode="create" onClose={() => setCreating(false)} /> : null}
      {editing ? (
        <ChannelDialog mode="edit" channel={editing} onClose={() => setEditing(null)} />
      ) : null}
    </Card>
  );
}

function ChannelRow({
  channel,
  onEdit,
}: {
  channel: Row<ChannelJsonld>;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);
  const caps = (channel.capabilities ?? []) as string[];
  const enabled = (channel as unknown as { enabled?: boolean }).enabled === true;
  const error = (channel as unknown as { lastSyncError?: string | null }).lastSyncError;

  const remove = async () => {
    if (!channel.id) return;
    if (!window.confirm(t('ws_channels.confirm_delete', { name: channel.name }))) return;
    setDeleting(true);
    try {
      await api.delete(`/channels/${channel.id}`);
      void invalidate({ resource: 'channels', invalidates: ['list'] });
      toast.success(t('toast.channel_deleted', { name: channel.name }));
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.could_not_delete_channel'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <TableRow>
      <TableCell>
        {enabled ? (
          <Power className="size-4 text-emerald-500" />
        ) : (
          <Power className="size-4 text-muted-foreground/40" />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{channel.name}</span>
          <Badge variant="outline" className="text-[9px]">
            {(channel as unknown as { isShared?: boolean }).isShared === false ? t('ws_channels.personal') : t('ws_channels.team')}
          </Badge>
        </div>
        {channel.address ? (
          <div className="text-xs text-muted-foreground">{channel.address}</div>
        ) : null}
        {error ? (
          <div className="mt-0.5 text-xs text-destructive truncate" title={error}>
            {error}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="text-xs">
        {ADAPTER_LABEL[channel.adapterCode ?? ''] ? t(ADAPTER_LABEL[channel.adapterCode ?? '']) : channel.adapterCode}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {caps.map((c) => (
            <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
          ))}
        </div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {(channel as unknown as { lastSyncedAt?: string | null }).lastSyncedAt ? (
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3" />
            {new Date((channel as unknown as { lastSyncedAt: string }).lastSyncedAt).toLocaleString(intlLocale())}
          </span>
        ) : (
          t('ws_channels.never')
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
          <Pencil className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7" onClick={remove} disabled={deleting}>
          {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        </Button>
      </TableCell>
    </TableRow>
  );
}

type DialogProps =
  | { mode: 'create'; onClose: () => void }
  | { mode: 'edit'; channel: Row<ChannelJsonld>; onClose: () => void };

function ChannelDialog(props: DialogProps) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const isEdit = props.mode === 'edit';
  const initial = isEdit ? props.channel : null;

  const [name, setName] = useState(initial?.name ?? '');
  const [adapterCode, setAdapterCode] = useState(initial?.adapterCode ?? 'email_imap');
  const [address, setAddress] = useState(initial?.address ?? '');

  // Email-IMAP/SMTP fields. When we add email_graph / email_gmail
  // adapters in C.5 this block switches by adapterCode to an
  // OAuth-button flow.
  const ic = (initial?.inboundConfig ?? {}) as Record<string, unknown>;
  const oc = (initial?.outboundConfig ?? {}) as Record<string, unknown>;
  const ac = (initial?.authConfig ?? {}) as Record<string, unknown>;
  const [imapHost, setImapHost] = useState(String(ic.host ?? ''));
  const [imapPort, setImapPort] = useState(String(ic.port ?? '993'));
  const [imapEnc, setImapEnc] = useState(String(ic.encryption ?? 'ssl'));
  const [imapFolder, setImapFolder] = useState(String(ic.folder ?? 'INBOX'));
  const [smtpHost, setSmtpHost] = useState(String(oc.host ?? ''));
  const [smtpPort, setSmtpPort] = useState(String(oc.port ?? '587'));
  const [smtpEnc, setSmtpEnc] = useState(String(oc.encryption ?? 'tls'));
  const [smtpFrom, setSmtpFrom] = useState(String(oc.from ?? ''));
  const [username, setUsername] = useState(String(ac.username ?? ''));
  const [password, setPassword] = useState('');

  const [inboundEnabled, setInboundEnabled] = useState(true);
  const [outboundEnabled, setOutboundEnabled] = useState(true);
  const [visibility, setVisibility] = useState<ChannelVisibility>({
    isShared: (initial as unknown as { isShared?: boolean })?.isShared ?? true,
    ownerUser: (initial as unknown as { ownerUser?: string | null })?.ownerUser ?? null,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEdit && initial) {
      const caps = (initial.capabilities ?? []) as string[];
      setInboundEnabled(caps.includes('inbound'));
      setOutboundEnabled(caps.includes('outbound'));
    }
  }, [isEdit, initial]);

  const submit = async () => {
    if (!name.trim()) {
      toast.error(t('toast.name_required'));
      return;
    }
    if (!inboundEnabled && !outboundEnabled) {
      toast.error(t('toast.min_one_capability'));
      return;
    }
    setSaving(true);
    try {
      const caps: string[] = [];
      if (inboundEnabled) caps.push('inbound');
      if (outboundEnabled) caps.push('outbound');

      const body: Record<string, unknown> = {
        name: name.trim(),
        adapterCode,
        capabilities: caps,
        address: address.trim() || null,
        inboundConfig: inboundEnabled
          ? { host: imapHost, port: Number(imapPort) || 993, encryption: imapEnc, folder: imapFolder || 'INBOX' }
          : {},
        outboundConfig: outboundEnabled
          ? { host: smtpHost, port: Number(smtpPort) || 587, encryption: smtpEnc, from: smtpFrom || address }
          : {},
        isShared: visibility.isShared,
        ownerUser: visibility.ownerUser,
      };
      // Only send authConfig on changes — keep the existing encrypted
      // value on edit when the operator didn't retype the password.
      const authPatch: Record<string, unknown> = {};
      if (username !== '') authPatch.username = username;
      if (password !== '') authPatch.password = password;
      if (Object.keys(authPatch).length > 0 || !isEdit) {
        body.authConfig = isEdit ? { ...ac, ...authPatch } : authPatch;
      }

      if (isEdit && props.channel.id) {
        await api.patch(`/channels/${props.channel.id}`, body, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
        toast.success(t('toast.channel_updated', { name }));
      } else {
        const workspaceId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (!workspaceId) throw new Error('Kein aktiver Workspace.');
        await api.post('/channels', { ...body, workspace: `/v1/workspaces/${workspaceId}` });
        toast.success(t('toast.channel_created', { name }));
      }
      void invalidate({ resource: 'channels', invalidates: ['list'] });
      props.onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.could_not_save_channel'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('ws_channels.dialog_title_edit', { name: initial?.name }) : t('ws_channels.dialog_title_create')}
          </DialogTitle>
          <DialogDescription>
            {t('ws_channels.dialog_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">{t('ws_channels.field_name')}</Label>
              <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('ws_channels.name_placeholder')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-adapter">{t('ws_channels.field_type')}</Label>
              <Select value={adapterCode} onValueChange={setAdapterCode}>
                <SelectTrigger id="ch-adapter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email_imap">{t('ws_channels.adapter_imap')}</SelectItem>
                  <SelectItem value="email_graph">{t('ws_channels.adapter_graph')}</SelectItem>
                  <SelectItem value="email_gmail">{t('ws_channels.adapter_gmail')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ch-address">{t('ws_channels.field_address')}</Label>
            <Input id="ch-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="support@firma.de" />
          </div>

          <ChannelVisibilityFields value={visibility} onChange={setVisibility} />

          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={inboundEnabled} onChange={(e) => setInboundEnabled(e.target.checked)} />
              {t('ws_channels.inbound')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={outboundEnabled} onChange={(e) => setOutboundEnabled(e.target.checked)} />
              {t('ws_channels.outbound')}
            </label>
          </div>

          {adapterCode === 'email_imap' ? (
            <>
              {inboundEnabled ? (
                <fieldset className="space-y-2 rounded-md border p-3">
                  <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">IMAP</legend>
                  <div className="grid grid-cols-[1fr_100px_120px] gap-2">
                    <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="Host (imap.firma.de)" />
                    <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="Port" />
                    <Select
                      value={imapEnc === '' ? 'none' : imapEnc}
                      onValueChange={(v) => setImapEnc(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL</SelectItem>
                        <SelectItem value="tls">TLS</SelectItem>
                        <SelectItem value="none">{t('ws_channels.encryption_none')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input value={imapFolder} onChange={(e) => setImapFolder(e.target.value)} placeholder="Folder (INBOX)" />
                </fieldset>
              ) : null}

              {outboundEnabled ? (
                <fieldset className="space-y-2 rounded-md border p-3">
                  <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">SMTP</legend>
                  <div className="grid grid-cols-[1fr_100px_120px] gap-2">
                    <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="Host (smtp.firma.de)" />
                    <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="Port" />
                    <Select
                      value={smtpEnc === '' ? 'none' : smtpEnc}
                      onValueChange={(v) => setSmtpEnc(v === 'none' ? '' : v)}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL</SelectItem>
                        <SelectItem value="tls">STARTTLS</SelectItem>
                        <SelectItem value="none">{t('ws_channels.encryption_none')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder={t('ws_channels.smtp_from_placeholder')} />
                </fieldset>
              ) : null}

              <fieldset className="space-y-2 rounded-md border p-3">
                <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Auth</legend>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={t('ws_channels.username_placeholder')} />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? t('ws_channels.password_placeholder_edit') : t('ws_channels.password_placeholder')}
                  autoComplete="new-password"
                />
              </fieldset>
            </>
          ) : (
            <OAuthConnectBlock channelId={isEdit ? props.channel.id ?? null : null} adapterCode={adapterCode} hasToken={Boolean(((initial?.authConfig ?? {}) as Record<string, unknown>).accessToken)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>{t('action.cancel')}</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? t('action.save') : t('ws_channels.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
