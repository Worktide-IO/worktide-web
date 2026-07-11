import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  // Lazy initial state so the no-token error path doesn't setState synchronously
  // inside the effect (react-hooks/set-state-in-effect).
  const [phase, setPhase] = useState<Phase>(token ? 'working' : 'error');
  const [message, setMessage] = useState<string | null>(
    token ? null : t('accept_share.invalid_link'),
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
          setMessage(t('accept_share.expired'));
        } else if (status === 400) {
          // e.g. no active workspace, or trying to share into the host workspace.
          setPhase('error');
          setMessage(detail?.detail ?? t('accept_share.no_workspace'));
        } else if (status === 403) {
          setPhase('error');
          setMessage(t('accept_share.not_member'));
        } else {
          setPhase('error');
          setMessage(detail?.detail ?? detail?.message ?? t('accept_share.accept_failed'));
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
            <CardDescription>{t('accept_share.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {phase === 'working' ? (
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('accept_share.accepting')}
              </div>
            ) : null}

            {phase === 'success' ? (
              <>
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>
                    {result?.projectName
                      ? t('accept_share.success_named', { name: result.projectName })
                      : t('accept_share.success')}
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
                  {t('accept_share.to_project')}
                </Button>
              </>
            ) : null}

            {phase === 'needsLogin' ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {t('accept_share.needs_login')}
                </p>
                <Button className="w-full" onClick={() => navigate('/login')}>
                  {t('accept_share.login')}
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
                  {t('accept_share.to_home')}
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
