import { useList } from '@refinedev/core';
import { CalendarDays, ExternalLink, Mail, Phone, Server, Star } from 'lucide-react';
import { Link } from 'react-router';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
import type { CustomerSystemJsonld } from '@/api/types/customerSystem/Jsonld';
import type { ServiceSubscriptionJsonld } from '@/api/types/serviceSubscription/Jsonld';
import { formatMoney } from '@/lib/money';
import type { Row } from '@/lib/refine';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * Three customer-scoped list snippets sharing one file because each is
 * a thin wrapper around `useList` with a single filter. The respective
 * full pages (/contacts, /customer-systems, /subscriptions) still own
 * the heavy filters and column sets; these tabs are read-only "what
 * does this customer have?" cards that link out for create / edit.
 */

const STATUS_BADGE: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  trial: { label: 'Trial', variant: 'outline' },
  active: { label: 'Aktiv', variant: 'default' },
  paused: { label: 'Pausiert', variant: 'secondary' },
  cancelled: { label: 'Gekündigt', variant: 'destructive' },
};

const BILLING_LABEL: Record<string, string> = {
  monthly: 'Mtl.',
  quarterly: 'Q',
  half_yearly: 'HJ',
  yearly: 'Jährl.',
  once: 'Einmal',
};

const ENV_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  production: { label: 'Prod', variant: 'default' },
  staging: { label: 'Stage', variant: 'secondary' },
  development: { label: 'Dev', variant: 'outline' },
};

export function CustomerContactsTab({ customerIri }: { customerIri: string }) {
  const { result, query } = useList<Row<ContactJsonld>>({
    resource: 'contacts',
    pagination: { mode: 'off' },
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    sorters: [{ field: 'lastName', order: 'asc' }],
  });
  const rows = result?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Kontakte ({rows.length})</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/contacts/create">Neu</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState>Noch keine Ansprechpartner hinterlegt.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Telefon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                const phone = c.mobile ?? c.phone ?? null;
                return (
                  <TableRow key={c['@id']}>
                    <TableCell>
                      <Avatar className="size-7">
                        <AvatarFallback className="text-xs">{initialsFor(c)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={`/contacts/${c.id}`}
                        className="font-medium hover:underline inline-flex items-center gap-1.5"
                      >
                        {c.firstName} {c.lastName}
                        {c.isPrimary ? (
                          <Star className="size-3 fill-amber-400 text-amber-400" />
                        ) : null}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.position ?? '—'}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Mail className="size-3" /> {c.email}
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {phone ? (
                        <a
                          href={`tel:${phone}`}
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Phone className="size-3" /> {phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function CustomerSystemsTab({ customerIri }: { customerIri: string }) {
  const { result, query } = useList<Row<CustomerSystemJsonld>>({
    resource: 'customer_systems',
    pagination: { mode: 'off' },
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    sorters: [{ field: 'name', order: 'asc' }],
  });
  const rows = result?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <CardTitle>Systeme ({rows.length})</CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link to="/customer-systems/create">Neu</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState>Noch keine Systeme angelegt.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-28">Typ</TableHead>
                <TableHead className="w-24">Env</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-24">Version</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const env = ENV_BADGE[s.environment ?? 'production'];
                return (
                  <TableRow key={s['@id']}>
                    <TableCell>
                      <Server className="size-4 text-muted-foreground" />
                    </TableCell>
                    <TableCell>
                      <Link to={`/customer-systems/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {s.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {env ? (
                        <Badge variant={env.variant} className="text-[10px]">
                          {env.label}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <span className="truncate max-w-72">
                            {s.url.replace(/^https?:\/\//, '')}
                          </span>
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {s.systemVersion ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function CustomerSubscriptionsTab({ customerIri }: { customerIri: string }) {
  const { result, query } = useList<Row<ServiceSubscriptionJsonld>>({
    resource: 'service_subscriptions',
    pagination: { mode: 'off' },
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    sorters: [{ field: 'nextBillingOn', order: 'asc' }],
  });
  const { result: systems } = useList<Row<CustomerSystemJsonld>>({
    resource: 'customer_systems',
    pagination: { mode: 'off' },
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
  });
  const systemByIri: Record<string, Row<CustomerSystemJsonld>> = {};
  for (const s of systems?.data ?? []) {
    if (s['@id']) systemByIri[s['@id']] = s;
  }

  const rows = result?.data ?? [];
  // Customer-local MRR view — same amortisation rule as the global page.
  const mrrCents = rows
    .filter((r) => r.status === 'active')
    .reduce((sum, r) => sum + monthlyEquivalentCents(r), 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Abos ({rows.length})</CardTitle>
          {mrrCents > 0 ? (
            <p className="text-xs text-muted-foreground mt-1">
              MRR ca. {formatMoney(mrrCents, 'eur')}
            </p>
          ) : null}
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/subscriptions/create">Neu</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <EmptyState>Noch keine Subscriptions hinterlegt.</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-40">System</TableHead>
                <TableHead className="w-32">Status</TableHead>
                <TableHead className="w-20">Zyklus</TableHead>
                <TableHead className="w-28 text-right">Preis</TableHead>
                <TableHead className="w-32">Nächste</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => {
                const system = s.system ? systemByIri[s.system] : null;
                const statusBadge = STATUS_BADGE[s.status ?? 'active'];
                return (
                  <TableRow key={s['@id']}>
                    <TableCell>
                      <Link to={`/subscriptions/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {system?.name ?? <span className="italic">— Kundenweit —</span>}
                    </TableCell>
                    <TableCell>
                      {statusBadge ? (
                        <Badge variant={statusBadge.variant} className="text-[10px]">
                          {statusBadge.label}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {BILLING_LABEL[s.billingCycle ?? 'monthly'] ?? s.billingCycle}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatMoney(s.priceCents ?? 0, s.currency ?? 'eur')}
                    </TableCell>
                    <TableCell className="text-xs">
                      {s.nextBillingOn ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <CalendarDays className="size-3" />
                          {new Date(s.nextBillingOn).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function initialsFor(c: Row<ContactJsonld>): string {
  const f = (c.firstName ?? '').trim();
  const l = (c.lastName ?? '').trim();
  if (f && l) return (f[0] + l[0]).toUpperCase();
  if (f) return f[0].toUpperCase();
  if (l) return l[0].toUpperCase();
  return '?';
}

function monthlyEquivalentCents(s: Row<ServiceSubscriptionJsonld>): number {
  const price = s.priceCents ?? 0;
  switch (s.billingCycle) {
    case 'monthly':
      return price;
    case 'quarterly':
      return price / 3;
    case 'half_yearly':
      return price / 6;
    case 'yearly':
      return price / 12;
    case 'once':
      return price / 12;
    default:
      return price;
  }
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-center text-sm text-muted-foreground py-8">{children}</p>;
}
