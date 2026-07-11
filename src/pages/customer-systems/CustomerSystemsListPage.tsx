import { useTable } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { ExternalLink, Plus, Search, Server, Wifi, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { CustomerSystemJsonld } from '@/api/types/customerSystem/Jsonld';
import { useLiveResource } from '@/lib/mercure';
import { CustomerCombobox } from '@/components/CustomerCombobox';
import type { Row } from '@/lib/refine';
import { useCustomerLookup } from '@/lib/useCustomerLookup';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
 * CustomerSystem list (TYPO3 / WordPress / Magento / … instances per
 * customer). Searchable by name, filterable by customer and type, lives
 * on /customer-systems and is the single entry-point to the system's
 * admin URLs.
 *
 * Same IRI-join trick the other CRM pages use: one off-paginated
 * /v1/customers fetch resolves the FK in the row.
 */
const TYPE_LABEL: Record<string, string> = {
  typo3: 'system_type.typo3',
  wordpress: 'system_type.wordpress',
  drupal: 'system_type.drupal',
  magento: 'system_type.magento',
  shopware: 'system_type.shopware',
  joomla: 'system_type.joomla',
  symfony: 'system_type.symfony',
  laravel: 'system_type.laravel',
  static: 'system_type.static',
  other: 'system_type.other',
};

const ENV_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  production: { label: 'env_badge.production', variant: 'default' },
  staging: { label: 'env_badge.staging', variant: 'secondary' },
  development: { label: 'env_badge.development', variant: 'outline' },
};

export function CustomerSystemsListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<CustomerSystemJsonld>>({
    resource: 'customer_systems',
    sorters: { initial: [{ field: 'name', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });
  const { connected: liveConnected } = useLiveResource('customer_systems');

  const applyFilters = (s: string, c: string, t: string) => {
    const f = [];
    if (s) f.push({ field: 'name', operator: 'contains' as const, value: s });
    if (c !== 'all') f.push({ field: 'customer', operator: 'eq' as const, value: c });
    if (t !== 'all') f.push({ field: 'type', operator: 'eq' as const, value: t });
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
            <h2 className="text-2xl">{t('customer_systems_list.heading')}</h2>
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
          <p className="text-sm text-muted-foreground">
            {t('customer_systems_list.count', { count: total })}
          </p>
        </div>
        <Button asChild>
          <Link to="/customer-systems/create">
            <Plus className="size-4" /> {t('customer_systems_list.new')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>{t('customer_systems_list.overview')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t('customer_systems_list.search_placeholder')}
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  applyFilters(e.target.value, customerFilter, typeFilter);
                }}
                className="pl-8"
              />
            </div>
            <CustomerCombobox
              className="w-56"
              placeholder={t('customer_systems_list.all_customers')}
              value={customerFilter === 'all' ? null : customerFilter}
              onChange={(v) => {
                const next = v ?? 'all';
                setCustomerFilter(next);
                applyFilters(search, next, typeFilter);
              }}
            />
            <Select
              value={typeFilter}
              onValueChange={(v) => {
                setTypeFilter(v);
                applyFilters(search, customerFilter, v);
              }}
            >
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t('customer_systems_list.type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('customer_systems_list.all_types')}</SelectItem>
                {Object.entries(TYPE_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {search || customerFilter !== 'all' || typeFilter !== 'all'
                ? t('customer_systems_list.no_matches')
                : t('customer_systems_list.empty')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>{t('customer_systems_list.col_name')}</TableHead>
                  <TableHead className="w-32">{t('customer_systems_list.col_type')}</TableHead>
                  <TableHead className="w-24">{t('customer_systems_list.col_environment')}</TableHead>
                  <TableHead className="w-48">{t('customer_systems_list.col_customer')}</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead className="w-24">{t('customer_systems_list.col_version')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const customer = s.customer ? customerByIri[s.customer] : null;
                  const env = ENV_BADGE[s.environment ?? 'production'];
                  return (
                    <TableRow
                      key={s['@id']}
                      className="cursor-pointer"
                      onClick={() => s.id && navigate(`/customer-systems/${s.id}`)}
                    >
                      <TableCell>
                        <Server className="size-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.name}</span>
                          {s.isActive === false ? (
                            <Badge variant="outline" className="text-[10px]">{t('customer_systems_list.inactive')}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {TYPE_LABEL[s.type ?? 'other'] ? t(TYPE_LABEL[s.type ?? 'other']) : s.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {env ? (
                          <Badge variant={env.variant} className="text-[10px]">
                            {t(env.label)}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer?.name ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.url ? (
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 hover:underline"
                          >
                            <span className="truncate max-w-64">{s.url.replace(/^https?:\/\//, '')}</span>
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
    </div>
  );
}
