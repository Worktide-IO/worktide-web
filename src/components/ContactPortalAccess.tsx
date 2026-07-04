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
 * (workspace EDIT). Granting provisions a ROLE_PORTAL login and mails a
 * "set your password" link; the contact then sees only their reduced portal view.
 */
export function ContactPortalAccess({ contactId }: { contactId: string }) {
  const invalidate = useInvalidate();
  const { result: contact } = useOne<Row<ContactJsonld>>({ resource: 'contacts', id: contactId });
  const [busy, setBusy] = useState(false);

  if (!contact) return null;
  const active = Boolean(contact.linkedUser);
  const email = contact.email ?? '';

  async function run(action: 'grant-portal-access' | 'revoke-portal-access', okMsg: string) {
    setBusy(true);
    try {
      await api.post(`/contacts/${contactId}/${action}`);
      toast.success(okMsg);
      invalidate({ resource: 'contacts', id: contactId, invalidates: ['detail'] });
    } catch {
      toast.error('Aktion fehlgeschlagen.');
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
                <ShieldCheck className="size-3" /> aktiv
              </Badge>
              <span className="text-muted-foreground">{email}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => run('grant-portal-access', 'Einladung erneut gesendet.')}
              >
                <Mail className="size-4" /> Einladung erneut senden
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => run('revoke-portal-access', 'Portal-Zugang entzogen.')}
              >
                <ShieldOff className="size-4" /> Zugang entziehen
              </Button>
            </div>
          </>
        ) : (
          <>
            <Badge variant="outline" className="text-muted-foreground">kein Zugang</Badge>
            {email ? (
              <div>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run('grant-portal-access', 'Portal-Zugang freigeschaltet — Einladung versendet.')}
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
          Der Kontakt erhält einen Link zum Passwort-Setzen und meldet sich dann im Kundenportal an
          (strikt reduzierte Sicht — kein Workspace-Zugang).
        </p>
      </CardContent>
    </Card>
  );
}
