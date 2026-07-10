import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { api, setAccessToken, writeAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';
import { BrandingFooter } from '@/components/BrandingFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AcceptResponse = {
  workspaceId?: string;
  userId?: string;
  token?: string;
};

/**
 * Landing page for the workspace-invitation magic link
 * ({SPA_BASE_URL}/accept-invitation?token=…). POSTs to the public
 * /v1/workspace_invitations/{token}/accept endpoint. If the invitee has no
 * account yet the backend requires firstName/lastName/password to create one;
 * for an existing email an empty body suffices. On success we store the
 * returned JWT + workspace and drop the user straight into the app.
 */
export function AcceptInvitationPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      setError('Ungültiger oder fehlender Einladungslink.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // Send the account fields only when the invitee is filling them in — an
      // existing account accepts with an empty body.
      const body: Record<string, string> = {};
      if (firstName) body.firstName = firstName;
      if (lastName) body.lastName = lastName;
      if (password) body.password = password;

      const { data } = await api.post<AcceptResponse>(
        `/workspace_invitations/${encodeURIComponent(token)}/accept`,
        body,
      );
      if (data.token) setAccessToken(data.token); // in-memory; refresh cookie set by the response
      if (data.workspaceId) writeAuth(WORKSPACE_STORAGE_KEY, data.workspaceId);
      navigate('/', { replace: true });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const msg = (err as { response?: { data?: { detail?: string; message?: string } } })?.response
        ?.data;
      if (status === 429) {
        setError('Zu viele Versuche. Bitte später erneut versuchen.');
      } else if (status === 404) {
        setError('Diese Einladung ist ungültig oder abgelaufen.');
      } else {
        setError(msg?.detail ?? msg?.message ?? 'Einladung konnte nicht angenommen werden.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card className="w-full">
          <CardHeader className="text-center items-center">
            <BrandLogo className="h-9 w-auto" />
            <CardDescription>Sie wurden zu einem Workspace eingeladen.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} noValidate className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Falls Sie noch kein Konto haben, vergeben Sie unten ein Passwort. Bestehende
                Konten können die Felder leer lassen.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Vorname</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Nachname</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Passwort (nur für neue Konten)</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {error ? (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <Button type="submit" className="w-full" disabled={busy || !token}>
                {busy ? 'Einladung annehmen …' : 'Einladung annehmen'}
              </Button>
            </form>
          </CardContent>
        </Card>
        <BrandingFooter />
      </div>
    </div>
  );
}
