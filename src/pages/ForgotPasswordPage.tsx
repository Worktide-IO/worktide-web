import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * PLACEHOLDER — added 2026-07-04 to unblock the dev build. `App.tsx` routes
 * `/forgot-password` here, but the real "request password reset" form was
 * never committed. The backend flow exists (ForgotPasswordController +
 * PasswordResetService); wire this page to `POST /v1/auth/forgot-password`
 * when building it. See ../worktide-portal/docs/PLAN.md.
 */
export function ForgotPasswordPage() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen grid place-items-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('forgot_password.title')}</CardTitle>
          <CardDescription>{t('forgot_password.not_implemented')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {t('forgot_password.hint')}{' '}
            <Link to="/login" className="underline">
              {t('forgot_password.back_to_login')}
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
