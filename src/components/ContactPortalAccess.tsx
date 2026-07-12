import { useInvalidate, useOne } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { KeyRound, Mail, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Staff control to grant/revoke a CRM contact's customer-portal access, shown
 * in the contact record. Backed by POST /v1/contacts/{id}/{grant,revoke}-portal-access
 * and .../send-portal-invitation (workspace EDIT).
 *
 * Two-step flow: granting only *provisions* the ROLE_PORTAL login ("Freischaltung"),
 * then we offer to send the branded invitation email (set-password link + the
 * workspace's configured welcome text). portalInvitedAt tracks whether/when it went out.
 */
export function ContactPortalAccess({ contactId }: { contactId: string }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const { result: contact } = useOne<Row<ContactJsonld> & { portalInvitedAt?: string | null }>({
    resource: 'contacts',
    id: contactId,
  });
  const [busy, setBusy] = useState(false);

  const customerId = contact?.customer?.split('/').pop() ?? '';
  const { result: customer } = useOne<Row<CustomerJsonld> & { portalEnabled?: boolean }>({
    resource: 'customers',
    id: customerId,
    queryOptions: { enabled: Boolean(customerId) },
  });

  if (!contact) return null;
  const active = Boolean(contact.linkedUser);
  const email = contact.email ?? '';
  const invitedAt = contact.portalInvitedAt ?? null;
  // The customer's portal must be freigeschaltet before an invitation can be
  // sent — otherwise the contact would set a password but be locked out at
  // login (mirrors the backend guard in PortalAccessGrantController).
  const customerEnabled = Boolean(customer?.portalEnabled);

  async function call(action: string, okMsg: string) {
    setBusy(true);
    try {
      await api.post(`/contacts/${contactId}/${action}`);
      toast.success(okMsg);
      invalidate({ resource: 'contacts', id: contactId, invalidates: ['detail'] });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? t('toast.action_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" /> {t('contact_portal_access.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1 text-green-700 dark:text-green-400">
                <ShieldCheck className="size-3" /> {t('contact_portal.badge_active')}
              </Badge>
              <span className="text-muted-foreground">{email}</span>
            </div>

            {invitedAt ? (
              <p className="text-sm text-muted-foreground">
                {t('contact_portal.invited_on', { date: new Date(invitedAt).toLocaleDateString(intlLocale()) })}
              </p>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t('contact_portal.not_invited_yet')}
              </p>
            )}

            {!customerEnabled ? (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t('contact_portal.customer_not_enabled')}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || !customerEnabled}
                onClick={() =>
                  call(
                    'send-portal-invitation',
                    invitedAt ? t('contact_portal.toast_resent') : t('contact_portal.toast_sent'),
                  )
                }
              >
                <Mail className="size-4" />{' '}
                {invitedAt ? t('contact_portal.resend') : t('contact_portal.send')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => call('revoke-portal-access', t('contact_portal.toast_revoked'))}
              >
                <ShieldOff className="size-4" /> {t('contact_portal.revoke')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <Badge variant="outline" className="text-muted-foreground">
              {t('contact_portal.badge_no_access')}
            </Badge>
            {email ? (
              <div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => call('grant-portal-access', t('contact_portal.toast_granted'))}
                >
                  {t('contact_portal.grant')}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('contact_portal.email_required')}
              </p>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {t('contact_portal.footer_hint')}
        </p>
      </CardContent>
    </Card>
  );
}
