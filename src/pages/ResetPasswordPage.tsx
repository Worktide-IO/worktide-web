import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * PLACEHOLDER — added 2026-07-04 to unblock the dev build. `App.tsx` routes
 * `/reset-password` here, but the real "set new password" form was never
 * committed. The backend flow exists (ResetPasswordController + PasswordPolicy,
 * token via `?token=`); wire this to `POST /v1/auth/reset-password` when
 * building it. See ../worktide-portal/docs/PLAN.md.
 */
export function ResetPasswordPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('reset.set_new_password')}</CardTitle>
          <CardDescription>Diese Ansicht ist noch nicht implementiert (Platzhalter).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Reset-Token: <code className="font-mono text-xs">{token ?? '— fehlt —'}</code>
          </p>
          <p>
            Backend-Endpoint vorhanden — UI folgt. Solange:{' '}
            <Link to="/login" className="underline">
              zurück zur Anmeldung
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
