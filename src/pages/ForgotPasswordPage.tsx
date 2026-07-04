import { Link } from 'react-router';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * PLACEHOLDER — added 2026-07-04 to unblock the dev build. `App.tsx` routes
 * `/forgot-password` here, but the real "request password reset" form was
 * never committed. The backend flow exists (ForgotPasswordController +
 * PasswordResetService); wire this page to `POST /v1/auth/forgot-password`
 * when building it. See ../worktide-portal/docs/PLAN.md.
 */
export function ForgotPasswordPage() {
  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Passwort zurücksetzen</CardTitle>
          <CardDescription>Diese Ansicht ist noch nicht implementiert (Platzhalter).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
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
