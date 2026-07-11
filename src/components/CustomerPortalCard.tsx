import { useOne, useUpdate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Row } from '@/lib/refine';

// portalEnabled isn't in the Kubb-generated Customer type yet, so extend inline
// (same approach CustomerSlaCard takes for slaPolicy).
type CustomerRow = Row<CustomerJsonld> & { portalEnabled?: boolean };

/**
 * Per-customer portal "Freischaltung". While off, none of this customer's
 * contacts can log into the customer portal — the backend PortalUserChecker
 * blocks JWT issuance and every authenticated request for their ROLE_PORTAL
 * accounts, so flipping this off also kills any live session immediately.
 *
 * Writes Customer.portalEnabled via PATCH /v1/customers/{id} (workspace EDIT).
 * Granting an individual contact access (ContactPortalAccess) is a separate,
 * per-contact step that only takes effect once this switch is on.
 */
export function CustomerPortalCard({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { result: customer, query } = useOne<CustomerRow>({ resource: 'customers', id: customerId });
  const { mutate: update, mutation } = useUpdate<CustomerRow>();
  const saving = mutation.isPending;

  if (query.isLoading || !customer) return null;

  const enabled = Boolean(customer.portalEnabled);

  const handleToggle = (next: boolean) => {
    update(
      { resource: 'customers', id: customerId, values: { portalEnabled: next }, successNotification: false },
      {
        onSuccess: () =>
          toast.success(next ? t('toast.portal_enabled') : t('toast.portal_disabled')),
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(status === 403 ? t('toast.no_permission') : t('toast.could_not_save'));
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" /> Kundenportal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="customer-portal-enabled" className="text-sm font-medium">
              Portal für diesen Kunden freischalten
            </Label>
            <p className="text-sm text-muted-foreground">
              Erst wenn dies aktiv ist, können freigeschaltete Kontakte dieses Kunden sich im
              Kundenportal anmelden. Deaktivieren sperrt den Login sofort — auch laufende Sitzungen.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className={
                enabled ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'
              }
            >
              {enabled ? 'freigeschaltet' : 'gesperrt'}
            </Badge>
            <Switch
              id="customer-portal-enabled"
              checked={enabled}
              disabled={saving}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
