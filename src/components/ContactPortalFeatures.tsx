import { useOne, useUpdate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
import type { WorkspaceJsonld } from '@/api/types/workspace/Jsonld';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';

// Portal feature key → label. `tickets` is the core screen and never gateable.
const FEATURES: { key: string; label: string }[] = [
  { key: 'dashboard', label: 'contact_portal.feat_dashboard' },
  { key: 'monitoring', label: 'contact_portal.feat_monitoring' },
  { key: 'agreements', label: 'contact_portal.feat_agreements' },
  { key: 'invoices', label: 'contact_portal.feat_invoices' },
  { key: 'ideas', label: 'contact_portal.feat_ideas' },
  { key: 'proposals', label: 'contact_portal.feat_proposals' },
  { key: 'social', label: 'contact_portal.feat_social' },
  { key: 'documents', label: 'contact_portal.feat_documents' },
  { key: 'forms', label: 'contact_portal.feat_forms' },
];

type ContactRow = Row<ContactJsonld> & { portalHiddenFeatures?: string[] | null };

/**
 * Per-contact portal gating (Capability×Role matrix). For a contact WITH portal
 * access, staff can hide individual portal features that the workspace has
 * enabled — e.g. keep Rechnungen/Verträge from a junior contact. Writes
 * Contact.portalHiddenFeatures via PATCH /v1/contacts/{id} (workspace EDIT);
 * the portal's effective feature map = workspace features minus these.
 */
export function ContactPortalFeatures({ contactId }: { contactId: string }) {
  const { t } = useTranslation();
  const { result: contact } = useOne<ContactRow>({ resource: 'contacts', id: contactId });

  const stored = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
  const { result: workspace } = useOne<Row<WorkspaceJsonld> & { settings?: Record<string, unknown> | null }>({
    resource: 'workspaces',
    id: stored ?? '',
    queryOptions: { enabled: Boolean(stored) },
  });

  const { mutate: update, mutation } = useUpdate<ContactRow>();

  // Only meaningful once the contact can actually log in.
  if (!contact || !contact.linkedUser) return null;

  const wsFeatures = (workspace?.settings as { portal?: { features?: Record<string, boolean> } } | null | undefined)
    ?.portal?.features ?? {};
  const enabled = FEATURES.filter((f) => wsFeatures[f.key] === true);
  const hidden = contact.portalHiddenFeatures ?? [];

  function toggle(key: string, visible: boolean) {
    const next = visible ? hidden.filter((k) => k !== key) : [...hidden, key];
    update(
      { resource: 'contacts', id: contactId, values: { portalHiddenFeatures: next }, successNotification: false },
      {
        onSuccess: () => toast.success(t('toast.visibility_saved')),
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(status === 403 ? t('toast.no_permission') : t('toast.could_not_save'));
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <SlidersHorizontal className="size-4" /> {t('contact_portal.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('contact_portal.description')}
        </p>
        {enabled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('contact_portal.none_enabled')}
          </p>
        ) : (
          <div className="divide-y">
            {enabled.map((f) => {
              const visible = !hidden.includes(f.key);
              return (
                <div key={f.key} className="flex items-center justify-between py-2">
                  <Label htmlFor={`pf-${f.key}`} className="font-normal">{t(f.label)}</Label>
                  <Switch
                    id={`pf-${f.key}`}
                    checked={visible}
                    disabled={mutation.isPending}
                    onCheckedChange={(v) => toggle(f.key, v)}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
