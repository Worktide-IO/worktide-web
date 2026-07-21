import { useTable } from '@refinedev/core';
import { useLiveResource } from '@/lib/mercure';
import { useTranslation } from 'react-i18next';
import { Boxes, Package, Plus, Search, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { Row } from '@/lib/refine';
import {
  PRODUCT_STATUS_BADGE,
  PRODUCT_TYPE_LABEL,
  type ProductJsonld,
  type ProductStatus,
  type ProductType,
} from '@/lib/catalog';
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
 * Catalogue of the agency's own products & services. Lives at /produkte.
 * Products are versioned (managed on the detail page); services are versionless.
 */
export function ProductsListPage() {
  useLiveResource('products');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { tableQuery, setFilters, setCurrentPage } = useTable<Row<ProductJsonld>>({
    resource: 'products',
    sorters: { initial: [{ field: 'name', order: 'asc' }] },
    pagination: { currentPage: 1, pageSize: 50 },
    syncWithLocation: true,
  });

  const applyType = (t: string) => {
    setTypeFilter(t);
    setFilters(t === 'all' ? [] : [{ field: 'type', operator: 'eq', value: t }], 'replace');
    setCurrentPage(1);
  };

  const all = tableQuery.data?.data ?? [];
  const rows = search
    ? all.filter((p) => (p.name ?? '').toLowerCase().includes(search.toLowerCase()))
    : all;
  const isLoading = tableQuery.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <Boxes className="size-6 text-muted-foreground" /> {t('product_list.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('product_list.subtitle')}
          </p>
        </div>
        <Button asChild>
          <Link to="/produkte/create">
            <Plus className="size-4" /> {t('product_list.new')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-4">
          <CardTitle>{t('product_list.catalog')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder={t('product_list.search_name')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={typeFilter} onValueChange={applyType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={t('product_list.type')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('product_list.all_types')}</SelectItem>
                <SelectItem value="product">{t('product_list.products')}</SelectItem>
                <SelectItem value="service">{t('product_list.services')}</SelectItem>
              </SelectContent>
            </Select>
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
              {all.length === 0 ? t('product_list.empty') : t('product_list.no_matches')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('product_list.col_name')}</TableHead>
                  <TableHead className="w-28">{t('product_list.col_type')}</TableHead>
                  <TableHead className="w-32">{t('product_list.col_status')}</TableHead>
                  <TableHead className="w-40">{t('product_list.col_category')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const badge = PRODUCT_STATUS_BADGE[(p.status ?? 'active') as ProductStatus];
                  return (
                    <TableRow
                      key={p['@id']}
                      className="cursor-pointer"
                      onClick={() => p.id && navigate(`/produkte/${p.id}`)}
                    >
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2">
                          {p.type === 'service' ? (
                            <Wrench className="size-4 text-muted-foreground" />
                          ) : (
                            <Package className="size-4 text-muted-foreground" />
                          )}
                          {p.name}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t(PRODUCT_TYPE_LABEL[(p.type ?? 'product') as ProductType])}
                      </TableCell>
                      <TableCell>
                        {badge ? (
                          <Badge variant={badge.variant} className="text-[10px]">
                            {t(badge.label)}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {p.category ?? '—'}
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
