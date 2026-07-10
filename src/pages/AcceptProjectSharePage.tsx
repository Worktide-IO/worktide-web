import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { api } from '@/lib/api';
import { BrandLogo } from '@/components/BrandLogo';
import { BrandingFooter } from '@/components/BrandingFooter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';

type AcceptResponse = {
  shareId?: string;
  projectId?: string;
  projectName?: string;
  workspaceId?: string;
};

type Phase = 'working' | 'success' | 'needsLogin' | 'error';

/**
 * Landing page for the project-share magic link
 * ({SPA_BASE_URL}/accept-project-share?token=…). Unlike the workspace
 * invitation, accepting is auth-gated: the invitee must already be a logged-in
 * staff user, because the share is linked into their ACTIVE workspace (the
 * X-Workspace-Id the axios interceptor sends). We attempt the accept on mount —
 * the interceptor silently refreshes the session from the httpOnly cookie, so a
 * user who is "logged in in this browser" succeeds transparently. A 401 means no
 * session; we ask them to sign in and re-open the link (the token lives 14 days,
 * so that round-trip is painless).
 */
export function AcceptProjectSharePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  // Lazy initial state so the no-token error path doesn't setState synchronously
  // inside the effect (react-hooks/set-state-in-effect).
  const [phase, setPhase] = useState<Phase>(token ? 'working' : 'error');
  const [message, setMessage] = useState<string | null>(
    token ? null : 'Ungültiger oder fehlender Freigabe-Link.',
  );
  const [result, setResult] = useState<AcceptResponse | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current || !token) return;
    attempted.current = true;

    void (async () => {
      try {
        const { data } = await api.post<AcceptResponse>(
          `/project_share_invitations/${encodeURIComponent(token)}/accept`,
          {},
        );
        setResult(data);
        setPhase('success');
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        const detail = (err as { response?: { data?: { detail?: string; message?: string } } })
          ?.response?.data;
        if (status === 401) {
          setPhase('needsLogin');
        } else if (status === 404) {
          setPhase('error');
          setMessage('Diese Freigabe ist ungültig oder abgelaufen.');
        } else if (status === 400) {
          // e.g. no active workspace, or trying to share into the host workspace.
          setPhase('error');
          setMessage(
            detail?.detail ??
              'Freigabe nicht möglich. Bitte wechseln Sie in den Ziel-Workspace und öffnen Sie den Link erneut.',
          );
        } else if (status === 403) {
          setPhase('error');
          setMessage('Sie sind kein Mitglied des aktiven Workspaces.');
        } else {
          setPhase('error');
          setMessage(detail?.detail ?? detail?.message ?? 'Freigabe konnte nicht angenommen werden.');
        }
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Card className="w-full">
          <CardHeader className="text-center items-center">
            <BrandLogo className="h-9 w-auto" />
            <CardDescription>Projekt-Freigabe</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase === 'working' ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Freigabe wird angenommen …
              </div>
            ) : null}

            {phase === 'success' ? (
              <>
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    {result?.projectName
                      ? `„${result.projectName}“ wurde für Ihren Workspace freigegeben.`
                      : 'Das Projekt wurde für Ihren Workspace freigegeben.'}
                  </span>
                </div>
                <Button
                  className="w-full"
                  onClick={() =>
                    navigate(result?.projectId ? `/projects/${result.projectId}` : '/projects', {
                      replace: true,
                    })
                  }
                >
                  Zum Projekt
                </Button>
              </>
            ) : null}

            {phase === 'needsLogin' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Bitte melden Sie sich in dem Workspace an, für den das Projekt freigegeben werden
                  soll, und öffnen Sie diesen Link anschließend erneut.
                </p>
                <Button className="w-full" onClick={() => navigate('/login')}>
                  Anmelden
                </Button>
              </>
            ) : null}

            {phase === 'error' ? (
              <>
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{message}</span>
                </div>
                <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                  Zur Startseite
                </Button>
              </>
            ) : null}
          </CardContent>
        </Card>
        <BrandingFooter />
      </div>
    </div>
  );
}
