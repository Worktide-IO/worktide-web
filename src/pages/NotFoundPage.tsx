import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Compass } from 'lucide-react';

import { Button } from '@/components/ui/button';

/**
 * Branded 404 for unknown routes. Rendered by the catch-all <Route path="*">
 * inside the authenticated shell, so it keeps the sidebar + header and offers a
 * one-click way back to the dashboard instead of a blank/broken screen.
 */
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-7xl font-bold tracking-tight text-muted-foreground/60">404</p>
      <div className="flex items-center gap-2 text-lg font-medium">
        <Compass className="size-5 text-muted-foreground" />
        {t('not_found.title')}
      </div>
      <p className="max-w-md text-sm text-muted-foreground">{t('not_found.description')}</p>
      <Button asChild className="mt-2">
        <Link to="/">{t('not_found.back_home')}</Link>
      </Button>
    </div>
  );
}
