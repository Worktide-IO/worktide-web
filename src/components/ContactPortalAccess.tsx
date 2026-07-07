import { useInvalidate, useOne } from '@refinedev/core';
import { KeyRound, Mail, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
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
  const invalidate = useInvalidate();
  const { result: contact } = useOne<Row<ContactJsonld> & { portalInvitedAt?: string | null }>({
    resource: 'contacts',
    id: contactId,
  });
  const [busy, setBusy] = useState(false);

  if (!contact) return null;
  const active = Boolean(contact.linkedUser);
  const email = contact.email ?? '';
  const invitedAt = contact.portalInvitedAt ?? null;

  async function call(action: string, okMsg: string) {
    setBusy(true);
    try {
      await api.post(`/contacts/${contactId}/${action}`);
      toast.success(okMsg);
      invalidate({ resource: 'contacts', id: contactId, invalidates: ['detail'] });
    } catch (err) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail ?? 'Aktion fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" /> Kundenportal-Zugang
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {active ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1 text-green-700 dark:text-green-400">
                <ShieldCheck className="size-3" /> freigeschaltet
              </Badge>
              <span className="text-muted-foreground">{email}</span>
            </div>

            {invitedAt ? (
              <p className="text-sm text-muted-foreground">
                Einladung gesendet am {new Date(invitedAt).toLocaleDateString('de-DE')}.
              </p>
            ) : (
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Zugang freigeschaltet — es wurde noch keine Einladung versendet.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  call(
                    'send-portal-invitation',
                    invitedAt ? 'Einladung erneut gesendet.' : 'Einladung versendet.',
                  )
                }
              >
                <Mail className="size-4" />{' '}
                {invitedAt ? 'Einladung erneut senden' : 'Einladung senden'}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => call('revoke-portal-access', 'Portal-Zugang entzogen.')}
              >
                <ShieldOff className="size-4" /> Zugang entziehen
              </Button>
            </div>
          </>
        ) : (
          <>
            <Badge variant="outline" className="text-muted-foreground">
              kein Zugang
            </Badge>
            {email ? (
              <div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => call('grant-portal-access', 'Portal-Zugang freigeschaltet.')}
                >
                  Portal-Zugang freischalten
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Für die Freischaltung wird eine E-Mail-Adresse am Kontakt benötigt.
              </p>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Nach dem Freischalten senden Sie die Einladung — der Kontakt erhält einen Link zum
          Passwort-Setzen und meldet sich dann im Kundenportal an (strikt reduzierte Sicht — kein
          Workspace-Zugang).
        </p>
      </CardContent>
    </Card>
  );
}
