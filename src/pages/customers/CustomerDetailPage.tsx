import { useOne } from '@refinedev/core';
import { ArrowLeft, Building2, Globe, Hash, Mail, Phone } from 'lucide-react';
import { useNavigate, useParams, useSearchParams } from 'react-router';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CustomerAgreementsTab } from './CustomerAgreementsTab';
import { CustomerProductsTab } from './CustomerProductsTab';
import { CustomerForm } from './CustomerForm';
import {
  CustomerContactsTab,
  CustomerSubscriptionsTab,
  CustomerSystemsTab,
} from './CustomerDetailTabs';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  prospect: 'outline',
  active: 'default',
  inactive: 'secondary',
  churned: 'destructive',
  archived: 'outline',
};

const STATUS_LABEL: Record<string, string> = {
  prospect: 'Prospect',
  active: 'Aktiv',
  inactive: 'Inaktiv',
  churned: 'Churned',
  archived: 'Archiviert',
};

/**
 * Customer detail page — header + tabbed body.
 *
 * Tabs:
 *  - Übersicht    — embeds the full CustomerForm (edit mode), so the
 *                   detail page IS the editor. Save bar floats to the
 *                   top-right inside the embedded form.
 *  - Kontakte     — customer-scoped contacts list, "Neu" routes out to
 *                   the full /contacts/create page
 *  - Systeme      — customer-scoped CustomerSystems list
 *  - Abos         — customer-scoped ServiceSubscriptions list, with
 *                   per-customer MRR estimate
 *
 * The active tab is mirrored to `?tab=…` so deep-links + browser-back
 * land on the right pane.
 */
export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const tab = search.get('tab') ?? 'overview';

  const { result: customer, query } = useOne<Row<CustomerJsonld>>({
    resource: 'customers',
    id: id ?? '',
    queryOptions: { enabled: Boolean(id) },
  });
  useLiveResource('customers');

  if (!id) {
    return <p className="text-sm text-destructive">Keine Customer-ID in der URL.</p>;
  }
  if (query.isLoading || !customer) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const c = customer;
  const iri = c['@id'] ?? '';
  const statusKey = c.status ?? 'active';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 -ml-2 gap-1"
              onClick={() => navigate('/customers')}
            >
              <ArrowLeft className="size-3" /> Kunden
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <Building2 className="size-5 text-muted-foreground" />
            <h2 className="text-2xl">{c.name}</h2>
            <Badge variant={STATUS_VARIANT[statusKey] ?? 'outline'} className="text-xs">
              {STATUS_LABEL[statusKey] ?? statusKey}
            </Badge>
            {c.isCompany === false ? (
              <Badge variant="outline" className="text-xs">
                Privatkunde
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {c.customerNumber ? (
              <span
                className="inline-flex items-center gap-1 font-mono"
                title="Kundennummer (aus lexoffice)"
              >
                <Hash className="size-3" />
                {c.customerNumber}
              </span>
            ) : null}
            {c.legalName ? <span>{c.legalName}</span> : null}
            {c.email ? (
              <a
                href={`mailto:${c.email}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Mail className="size-3" /> {c.email}
              </a>
            ) : null}
            {c.phone ? (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="size-3" /> {c.phone}
              </a>
            ) : null}
            {c.website ? (
              <a
                href={c.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Globe className="size-3" />
                {c.website.replace(/^https?:\/\//, '')}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(search);
          if (v === 'overview') {
            next.delete('tab');
          } else {
            next.set('tab', v);
          }
          setSearch(next, { replace: true });
        }}
      >
        <TabsList>
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="contacts">Kontakte</TabsTrigger>
          <TabsTrigger value="systems">Systeme</TabsTrigger>
          <TabsTrigger value="subscriptions">Abos</TabsTrigger>
          <TabsTrigger value="agreements">Verträge</TabsTrigger>
          <TabsTrigger value="products">Produkte</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="pt-4">
          <CustomerForm action="edit" id={id} embedded />
        </TabsContent>
        <TabsContent value="contacts" className="pt-4">
          <CustomerContactsTab customerIri={iri} />
        </TabsContent>
        <TabsContent value="systems" className="pt-4">
          <CustomerSystemsTab customerIri={iri} />
        </TabsContent>
        <TabsContent value="subscriptions" className="pt-4">
          <CustomerSubscriptionsTab customerIri={iri} />
        </TabsContent>
        <TabsContent value="agreements" className="pt-4">
          {id ? <CustomerAgreementsTab customerId={id} customerIri={iri} /> : null}
        </TabsContent>
        <TabsContent value="products" className="pt-4">
          {id ? <CustomerProductsTab customerIri={iri} /> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
