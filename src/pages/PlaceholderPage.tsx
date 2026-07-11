import { useMenu } from '@refinedev/core';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Acknowledges a sidebar navigation for resources whose dedicated page
 * hasn't landed yet. Replaced one resource at a time as we build the
 * actual list / detail / edit screens.
 *
 * The label comes from the same `useMenu` source the sidebar reads, so the
 * placeholder copy stays accurate without us hand-maintaining strings
 * in two places.
 */
export function PlaceholderPage({ resource: resourceName }: { resource: string }) {
  const { t } = useTranslation();
  const { menuItems } = useMenu();
  const item = menuItems.find((m) => m.name === resourceName);
  const label = (item?.meta?.label as string | undefined) ?? item?.label ?? resourceName;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-2xl">{label}</h2>
        <Badge variant="secondary">{t('placeholder_page.in_progress')}</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{t('placeholder_page.coming_soon')}</CardTitle>
          <CardDescription>
            Diese Ansicht entsteht in einem der kommenden Iterationsschritte. Die API
            dahinter (<code className="font-mono text-xs">{`/v1/${resourceName}`}</code>)
            funktioniert bereits — du kannst sie über die OpenAPI-Docs ausprobieren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Sortierung und Filter folgen dem API-Platform-Schema (
            <code className="font-mono text-xs">?order[updatedAt]=desc</code>,{' '}
            <code className="font-mono text-xs">?status=active</code>, …).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
