import { useList, useOne, useUpdate } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Row } from '@/lib/refine';

type NewsletterRow = Row<{
  '@id': string;
  id?: string;
  title: string;
  description?: string | null;
  parent?: string | null;
}>;

type CustomerRow = Row<{ '@id': string; id?: string }> & { enabledNewsletterIds?: string[] | null };

const ROOT = '__root__';

/**
 * Per-customer newsletter enablement ("einzeln freischaltbar"). Staff toggle
 * which workspace newsletter nodes this customer is granted; only granted nodes
 * appear in the customer's portal, where its contacts opt in/out. Writes
 * Customer.enabledNewsletterIds via PATCH /v1/customers/{id} (workspace EDIT).
 */
export function CustomerNewslettersTab({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { result: customer, query } = useOne<CustomerRow>({ resource: 'customers', id: customerId });
  const { result: list } = useList<NewsletterRow>({
    resource: 'newsletters',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { mutate: update, mutation } = useUpdate<CustomerRow>();

  const enabled = customer?.enabledNewsletterIds ?? [];
  const rows = list?.data ?? [];

  const iriOf = (r: NewsletterRow) => r['@id'] ?? (r.id ? `/v1/newsletters/${r.id}` : '');
  const idOf = (r: NewsletterRow) => r.id ?? iriOf(r).split('/').pop() ?? '';

  const childrenByParent: Record<string, NewsletterRow[]> = {};
  for (const r of rows) {
    (childrenByParent[r.parent ?? ROOT] ??= []).push(r);
  }

  function toggle(id: string, on: boolean) {
    const next = on ? [...enabled, id] : enabled.filter((x) => x !== id);
    update(
      { resource: 'customers', id: customerId, values: { enabledNewsletterIds: next }, successNotification: false },
      {
        onSuccess: () => {
          toast.success(t('toast.activation_saved'));
          void query.refetch();
        },
        onError: (err) => {
          const status = (err as { response?: { status?: number } })?.response?.status;
          toast.error(status === 403 ? t('toast.no_permission') : t('toast.could_not_save'));
        },
      },
    );
  }

  const renderNodes = (nodes: NewsletterRow[], depth: number): ReactNode =>
    nodes.map((n) => {
      const id = idOf(n);
      const children = childrenByParent[iriOf(n)] ?? [];
      return (
        <div key={iriOf(n)}>
          <div className="flex items-center justify-between py-2" style={{ paddingLeft: depth * 20 }}>
            <Label htmlFor={`nl-${id}`} className="font-normal">
              {n.title}
              {n.description ? (
                <span className="ml-2 text-xs text-muted-foreground">{n.description}</span>
              ) : null}
            </Label>
            <Switch
              id={`nl-${id}`}
              checked={enabled.includes(id)}
              disabled={mutation.isPending}
              onCheckedChange={(v) => toggle(id, v)}
            />
          </div>
          {children.length > 0 ? renderNodes(children, depth + 1) : null}
        </div>
      );
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" /> Newsletter-Freischaltung
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Welche Newsletter-Themen dieser Kunde im Portal sieht und abonnieren kann. Themen werden
          unter „Newsletter" (CRM) gepflegt.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch keine Newsletter-Themen angelegt.
          </p>
        ) : (
          <div className="divide-y">{renderNodes(childrenByParent[ROOT] ?? [], 0)}</div>
        )}
      </CardContent>
    </Card>
  );
}
