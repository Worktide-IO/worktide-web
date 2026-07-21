import { useList, useTable } from '@refinedev/core';
import { useLiveResource } from '@/lib/mercure';
import { useTranslation } from 'react-i18next';
import { ConciergeBell, Plus, Search, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { formatMoney } from '@/lib/money';
import type { Row } from '@/lib/refine';
import { type ServiceJsonld, type ServiceVersionJsonld } from '@/lib/services';
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
 * Catalogue of the agency's own versioned services. Lives at /services.
 * Each service carries a stack of ServiceVersions (managed on the detail
 * page); the current version's price is shown here for a quick overview.
 */
export function ServicesListPage() {
  useLiveResource('services');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { tableQuery } = useTable<Row<ServiceJsonld>>({
    resource: 'services',
    sorters: { initial: [{ field: 'name', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });

  const { result: versions } = useList<Row<ServiceVersionJsonld>>({
    resource: 'service_versions',
    pagination: { mode: 'off' },
  });
  const versionByIri = useMemo(() => {
    const m: Record<string, Row<ServiceVersionJsonld>> = {};
    for (const v of versions?.data ?? []) if (v['@id']) m[v['@id']] = v;
    return m;
  }, [versions]);

  const all = tableQuery.data?.data ?? [];
  const rows = search
    ? all.filter((s) => (s.name ?? '').toLowerCase().includes(search.toLowerCase()))
    : all;
  const isLoading = tableQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <ConciergeBell className="size-6 text-muted-foreground" /> {t('services_list.heading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('services_list.subtitle')}</p>
        </div>
        <Button asChild>
          <Link to="/services/create">
            <Plus className="size-4" /> {t('services_list.new')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>{t('services_list.catalog')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t('services_list.search_placeholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {all.length === 0 ? t('services_list.empty') : t('services_list.no_matches')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('services_list.col_name')}</TableHead>
                  <TableHead className="w-40">{t('services_list.col_category')}</TableHead>
                  <TableHead className="w-32 text-right">
                    {t('services_list.col_current_price')}
                  </TableHead>
                  <TableHead className="w-32">{t('services_list.col_status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s) => {
                  const current = s.currentVersion ? versionByIri[s.currentVersion] : undefined;
                  return (
                    <TableRow
                      key={s['@id']}
                      className="cursor-pointer"
                      onClick={() => s.id && navigate(`/services/${s.id}`)}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          <Wrench className="size-4 text-muted-foreground" />
                          {s.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.category ?? '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {current
                          ? formatMoney(current.netPriceCents ?? 0, current.currency ?? 'eur')
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={s.active === false ? 'outline' : 'default'}
                          className="text-[10px]"
                        >
                          {s.active === false
                            ? t('services_list.status_inactive')
                            : t('services_list.status_active')}
                        </Badge>
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
