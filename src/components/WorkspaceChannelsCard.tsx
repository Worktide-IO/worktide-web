import { useInvalidate, useList } from '@refinedev/core';
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
  email_graph: 'Microsoft 365',
  email_gmail: 'Google Workspace',
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
  const [busy, setBusy] = useState(false);
  const providerLabel = ADAPTER_PROVIDER_LABEL[adapterCode] ?? 'Provider';
  const startConnect = async () => {
    if (!channelId) {
      toast.error('Channel erst speichern, danach OAuth-Login starten.');
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.get<{ authorizeUrl: string }>(`/channels/${channelId}/oauth/start`);
      window.location.href = data.authorizeUrl;
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte OAuth-Login nicht starten.');
      setBusy(false);
    }
  };
  return (
    <fieldset className="space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">OAuth</legend>
      <p className="text-xs text-muted-foreground">
        Für {providerLabel} ist keine Passwort-Eingabe nötig. Klicke unten,
        um Worktide bei {providerLabel} freizugeben — Du wirst auf
        deren Anmelde-Seite weitergeleitet und kommst nach Bestätigung
        hierher zurück.
      </p>
      {hasToken ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="mr-1 inline size-4" />
          Verbunden — Token gespeichert.
        </div>
      ) : (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Noch nicht verbunden.
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
        {hasToken ? `Mit ${providerLabel} neu verbinden` : `Mit ${providerLabel} anmelden`}
      </Button>
    </fieldset>
  );
}

const ADAPTER_LABEL: Record<string, string> = {
  email_imap: 'E-Mail (IMAP/SMTP)',
  email_graph: 'E-Mail (Microsoft 365)',
  email_gmail: 'E-Mail (Google Workspace)',
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
          Mailboxen, Slack-Bots, Zabbix-Webhooks und alles weitere, was Worktide
          mit der Außenwelt verbindet. Auth-Daten werden libsodium-verschlüsselt
          in der DB abgelegt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Neuer Channel
          </Button>
        </div>

        {query.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : channels.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Keine Channels. Lege das erste Mail-Postfach an.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Name / Adresse</TableHead>
                <TableHead className="w-44">Typ</TableHead>
                <TableHead className="w-32">Capabilities</TableHead>
                <TableHead className="w-44">Letzter Sync</TableHead>
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
  const invalidate = useInvalidate();
  const [deleting, setDeleting] = useState(false);
  const caps = (channel.capabilities ?? []) as string[];
  const enabled = (channel as unknown as { enabled?: boolean }).enabled === true;
  const error = (channel as unknown as { lastSyncError?: string | null }).lastSyncError;

  const remove = async () => {
    if (!channel.id) return;
    if (!window.confirm(`Channel "${channel.name}" wirklich löschen? Konversationen + Events werden mit kaskadiert.`)) return;
    setDeleting(true);
    try {
      await api.delete(`/channels/${channel.id}`);
      void invalidate({ resource: 'channels', invalidates: ['list'] });
      toast.success(`Channel "${channel.name}" gelöscht.`);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Channel nicht löschen.');
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
            {(channel as unknown as { isShared?: boolean }).isShared === false ? 'Persönlich' : 'Team'}
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
        {ADAPTER_LABEL[channel.adapterCode ?? ''] ?? channel.adapterCode}
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
            {new Date((channel as unknown as { lastSyncedAt: string }).lastSyncedAt).toLocaleString('de-DE')}
          </span>
        ) : (
          'nie'
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
      toast.error('Name ist pflicht.');
      return;
    }
    if (!inboundEnabled && !outboundEnabled) {
      toast.error('Mindestens eine Capability (inbound oder outbound) wählen.');
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
        toast.success(`Channel "${name}" aktualisiert.`);
      } else {
        const workspaceId = localStorage.getItem(WORKSPACE_STORAGE_KEY);
        if (!workspaceId) throw new Error('Kein aktiver Workspace.');
        await api.post('/channels', { ...body, workspace: `/v1/workspaces/${workspaceId}` });
        toast.success(`Channel "${name}" angelegt.`);
      }
      void invalidate({ resource: 'channels', invalidates: ['list'] });
      props.onClose();
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Channel nicht speichern.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `Channel „${initial?.name}" bearbeiten` : 'Neuen Channel anlegen'}
          </DialogTitle>
          <DialogDescription>
            Konfiguration für die Verbindung zum Mail-Server. Passwort
            wird verschlüsselt gespeichert.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">Name</Label>
              <Input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Support-Postfach" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-adapter">Typ</Label>
              <Select value={adapterCode} onValueChange={setAdapterCode}>
                <SelectTrigger id="ch-adapter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email_imap">E-Mail (IMAP/SMTP)</SelectItem>
                  <SelectItem value="email_graph">E-Mail (Microsoft 365)</SelectItem>
                  <SelectItem value="email_gmail">E-Mail (Google Workspace / Gmail)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ch-address">Adresse</Label>
            <Input id="ch-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="support@firma.de" />
          </div>

          <ChannelVisibilityFields value={visibility} onChange={setVisibility} />

          <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={inboundEnabled} onChange={(e) => setInboundEnabled(e.target.checked)} />
              Eingehend
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={outboundEnabled} onChange={(e) => setOutboundEnabled(e.target.checked)} />
              Ausgehend
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
                        <SelectItem value="none">keine</SelectItem>
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
                        <SelectItem value="none">keine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} placeholder="From-Adresse (sonst = Adresse oben)" />
                </fieldset>
              ) : null}

              <fieldset className="space-y-2 rounded-md border p-3">
                <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Auth</legend>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Benutzername" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? 'Passwort (leer = unverändert)' : 'Passwort'}
                  autoComplete="new-password"
                />
              </fieldset>
            </>
          ) : (
            <OAuthConnectBlock channelId={isEdit ? props.channel.id ?? null : null} adapterCode={adapterCode} hasToken={Boolean(((initial?.authConfig ?? {}) as Record<string, unknown>).accessToken)} />
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={saving}>Abbrechen</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : isEdit ? <Pencil className="size-4" /> : <Plus className="size-4" />}
            {isEdit ? 'Speichern' : 'Anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
