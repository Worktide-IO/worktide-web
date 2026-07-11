import { useTable } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Mail, Phone, Plus, Search, Star, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import { useLiveResource } from '@/lib/mercure';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
 * Contacts list. Mirrors the customers + projects layout: searchable
 * table with a customer filter, Mercure-driven live updates, row-click
 * opens the edit page.
 *
 * The "customer" column resolves IRIs to names via a single off-paginated
 * fetch of /v1/customers — same pattern the other list pages use, no
 * embed-projection on the API side needed.
 */
export function ContactsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<ContactJsonld>>({
    resource: 'contacts',
    sorters: { initial: [{ field: 'lastName', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('contacts');

  const applyFilters = (s: string, c: string) => {
    const f = [];
    if (s) f.push({ field: 'lastName', operator: 'contains' as const, value: s });
    if (c !== 'all') f.push({ field: 'customer', operator: 'eq' as const, value: c });
    setFilters(f, 'replace');
    setCurrentPage(1);
  };

  const rows = tableQuery.data?.data ?? [];
  const total = tableQuery.data?.total ?? 0;
  const customerByIri = useCustomerLookup(rows.map((r) => r.customer));
  const isLoading = tableQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl">{t('contacts_list.heading')}</h2>
            {liveConnected ? (
              <Badge variant="secondary" className="gap-1 text-xs">
                <Wifi className="size-3" /> Live
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <WifiOff className="size-3" /> offline
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t('contacts_list.count', { count: total })}</p>
        </div>
        <Button asChild>
          <Link to="/contacts/create">
            <Plus className="size-4" /> {t('contacts_list.new')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>{t('contacts_list.overview')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t('contacts_list.search_placeholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, customerFilter);
                }}
                className="pl-8"
              />
            </div>
            <CustomerCombobox
              className="w-64"
              placeholder={t('contacts_list.all_customers')}
              value={customerFilter === 'all' ? null : customerFilter}
              onChange={(v) => {
                const next = v ?? 'all';
                setCustomerFilter(next);
                applyFilters(search, next);
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-12">
              {search || customerFilter !== 'all'
                ? t('contacts_list.no_matches')
                : t('contacts_list.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>{t('contacts_list.col_name')}</TableHead>
                  <TableHead className="w-48">{t('contacts_list.col_customer')}</TableHead>
                  <TableHead className="w-40">{t('contacts_list.col_position')}</TableHead>
                  <TableHead className="w-64">{t('contacts_list.col_email')}</TableHead>
                  <TableHead className="w-44">{t('contacts_list.col_phone')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const customer = c.customer ? customerByIri[c.customer] : null;
                  const phoneNumber = c.mobile ?? c.phone ?? null;
                  return (
                    <TableRow
                      key={c['@id']}
                      className="cursor-pointer"
                      onClick={() => c.id && navigate(`/contacts/${c.id}`)}
                    >
                      <TableCell>
                        <Avatar className="size-7">
                          <AvatarFallback className="text-xs">
                            {initialsFor(c)}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {c.firstName} {c.lastName}
                          </span>
                          {c.isPrimary ? (
                            <Star
                              className="size-3 fill-amber-400 text-amber-400"
                              aria-label={t('contacts_list.primary_contact')}
                            />
                          ) : null}
                          {c.isActive === false ? (
                            <Badge variant="outline" className="text-[10px]">{t('contacts_list.inactive')}</Badge>
                          ) : null}
                        </div>
                        {c.title ? (
                          <div className="text-xs text-muted-foreground">{c.title}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.position ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <Mail className="size-3" />
                            <span className="truncate">{c.email}</span>
                          </a>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {phoneNumber ? (
                          <a
                            href={`tel:${phoneNumber}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <Phone className="size-3" />
                            {phoneNumber}
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
    </div>
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
