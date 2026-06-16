import { useInvalidate, useList } from '@refinedev/core';
import {
  Ban,
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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

type Pat = {
  '@id'?: string;
  id?: string | null;
  name?: string;
  tokenPrefix?: string;
  scopes?: string[];
  expiresAt?: string | null;
  revokedAt?: string | null;
  lastUsedAt?: string | null;
  createdAt?: string;
  revoked?: boolean;
  owner?: string;
};

type IssuedPat = Pat & { plaintextToken?: string };

/**
 * Personal Access Tokens — list, create, revoke.
 *
 * The plaintext value comes back exactly once from the create-call;
 * after that only the prefix is visible. The flow:
 *
 *   1. User clicks "+ Neuer Token", names it, optionally picks an
 *      expiry date.
 *   2. POST /v1/personal_access_tokens returns { plaintextToken }.
 *   3. The IssuedDialog opens with a copy button and a warning that
 *      the value won't be shown again. Closing the dialog clears the
 *      plaintext from memory.
 *   4. The list refreshes; the new row shows only the prefix and a
 *      "Widerrufen"-button.
 *
 * Tokens are workspace-scoped (one PAT belongs to one workspace), so
 * we filter the list by the active workspace IRI.
 */
export function AccessTokensPage() {
  const invalidate = useInvalidate();
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedPat | null>(null);

  const workspaceId =
    typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const workspaceIri = workspaceId ? `/v1/workspaces/${workspaceId}` : null;

  const { result: tokens, query } = useList<Row<Pat>>({
    resource: 'personal_access_tokens',
    pagination: { mode: 'off' },
    sorters: [{ field: 'createdAt', order: 'desc' }],
    filters: workspaceIri
      ? [{ field: 'workspace', operator: 'eq', value: workspaceIri }]
      : [],
    queryOptions: { enabled: Boolean(workspaceIri) },
  });

  const handleCreated = (created: IssuedPat) => {
    setIssued(created);
    setCreateOpen(false);
    void invalidate({ resource: 'personal_access_tokens', invalidates: ['list'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <KeyRound className="size-6 text-muted-foreground" />
            Personal Access Tokens
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Langlebige Bearer-Tokens für externe Integrationen — CI-Skripte,
            der Worktide-MCP-Server, eigene Dashboards. Jeder Token läuft
            unter deinem User und respektiert deine Berechtigungen.
            Authentifizierung erfolgt per <code className="font-mono">X-Worktide-Token</code>-Header.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> Neuer Token
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Aktive Tokens</CardTitle>
          <CardDescription>
            Nicht widerrufene Tokens. Widerrufene Tokens werden ausgegraut am
            Ende der Liste angezeigt.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (tokens?.data?.length ?? 0) === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Noch keine Tokens. Klick auf <em>+ Neuer Token</em>, um den ersten anzulegen.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-40">Prefix</TableHead>
                  <TableHead className="w-40">Zuletzt benutzt</TableHead>
                  <TableHead className="w-32">Läuft ab</TableHead>
                  <TableHead className="w-24 text-right">Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tokens?.data ?? []).map((t) => (
                  <TokenRow key={t['@id']} token={t} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={handleCreated}
      />
      <IssuedDialog
        token={issued}
        onClose={() => setIssued(null)}
      />
    </div>
  );
}

function TokenRow({ token }: { token: Row<Pat> }) {
  const invalidate = useInvalidate();
  const [revoking, setRevoking] = useState(false);
  const isRevoked = Boolean(token.revoked || token.revokedAt);

  const revoke = async () => {
    if (!token.id) return;
    if (!window.confirm(`Token "${token.name}" wirklich widerrufen? Externe Integrationen, die diesen Token verwenden, brechen sofort ab.`)) {
      return;
    }
    setRevoking(true);
    try {
      await api.delete(`/personal_access_tokens/${token.id}`);
      toast.success(`Token "${token.name}" widerrufen.`);
      void invalidate({ resource: 'personal_access_tokens', invalidates: ['list'] });
    } catch {
      toast.error('Konnte Token nicht widerrufen.');
    } finally {
      setRevoking(false);
    }
  };

  return (
    <TableRow className={isRevoked ? 'opacity-60' : undefined}>
      <TableCell className="font-medium">{token.name ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {token.tokenPrefix ?? '—'}…
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : 'nie'}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {token.expiresAt ? new Date(token.expiresAt).toLocaleDateString() : 'unbegrenzt'}
      </TableCell>
      <TableCell className="text-right">
        {isRevoked ? (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <Ban className="size-3" /> widerrufen
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            aktiv
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        {isRevoked ? null : (
          <Button
            variant="ghost"
            size="sm"
            disabled={revoking}
            onClick={revoke}
          >
            {revoking ? <Loader2 className="size-3 animate-spin" /> : <Ban className="size-3" />}
            Widerrufen
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (token: IssuedPat) => void;
}) {
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setName('');
      setExpiresAt('');
    }
  }, [open]);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const workspaceId =
      typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    if (!workspaceId) {
      toast.error('Kein aktiver Workspace.');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: trimmed,
        workspace: `/v1/workspaces/${workspaceId}`,
      };
      if (expiresAt) {
        payload.expiresAt = `${expiresAt}T23:59:59Z`;
      }
      const { data } = await api.post<IssuedPat>('/personal_access_tokens', payload);
      onCreated(data);
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Konnte Token nicht anlegen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Personal Access Token anlegen</DialogTitle>
          <DialogDescription>
            Gib dem Token einen sprechenden Namen — typischerweise der Name
            der Integration, die ihn verwendet ("MCP lokal", "GitHub-Actions"
            etc.). Optional kannst du ein Ablaufdatum setzen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pat-name">Name</Label>
            <Input
              id="pat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. MCP lokal"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving && name.trim()) submit();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pat-expires">Ablaufdatum (optional)</Label>
            <Input
              id="pat-expires"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
            />
            <p className="text-xs text-muted-foreground">
              Leer = nie ablaufend (bis manuell widerrufen).
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={saving || !name.trim()}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Token erzeugen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IssuedDialog({
  token,
  onClose,
}: {
  token: IssuedPat | null;
  onClose: () => void;
}) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token) {
      setShow(false);
      setCopied(false);
    }
  }, [token]);

  if (!token) return null;
  const value = token.plaintextToken ?? '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Token in die Zwischenablage kopiert.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Kopieren fehlgeschlagen — bitte manuell auswählen.');
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-500" />
            Token "{token.name}" angelegt
          </DialogTitle>
          <DialogDescription>
            <strong className="text-foreground">
              Kopiere den Token jetzt — er wird nicht mehr angezeigt.
            </strong>{' '}
            Bewahre ihn wie ein Passwort auf; verloren = neu anlegen.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={show ? value : '•'.repeat(Math.min(value.length, 48))}
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Token verbergen' : 'Token anzeigen'}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={copy}>
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            </Button>
          </div>
          <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-xs">
            <p className="font-medium">Verwendung — Worktide-MCP-Server:</p>
            <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
{`{
  "mcpServers": {
    "worktide": {
      "command": "node",
      "args": ["/path/to/worktide-mcp/dist/index.js"],
      "env": {
        "WORKTIDE_API_URL": "${typeof window !== 'undefined' ? window.location.origin.replace(/^https?:\/\//, 'https://api.') : 'https://api.worktide.example.com'}/v1",
        "WORKTIDE_API_TOKEN": "${token.tokenPrefix ?? 'wt_pat_'}…"
      }
    }
  }
}`}
            </pre>
            <p className="font-medium pt-1">Verwendung — curl:</p>
            <pre className="overflow-x-auto rounded bg-background p-2 font-mono text-[11px]">
{`curl -H "X-Worktide-Token: ${token.tokenPrefix ?? 'wt_pat_'}…" \\
  https://api.worktide.example.com/v1/auth/me`}
            </pre>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Habe ich kopiert — schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
