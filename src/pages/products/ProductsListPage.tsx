import { useList } from '@refinedev/core';
import { useLiveResource } from '@/lib/mercure';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Package, Plus, Search, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
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
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

type P = Row<ProductJsonld>;

interface TreeNode {
  product: P;
  children: TreeNode[];
}

function buildTree(products: P[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const p of products) {
    byId.set(p['@id'] ?? '', { product: p, children: [] });
  }

  for (const p of products) {
    const node = byId.get(p['@id'] ?? '');
    if (!node) continue;
    const parentIri = (p as unknown as Record<string, unknown>).parent as string | undefined;
    if (parentIri) {
      const parent = byId.get(parentIri);
      if (parent) {
        parent.children.push(node);
        continue;
      }
    }
    roots.push(node);
  }

  return roots;
}

function TreeNodeRow({
  node,
  depth,
  onSelect,
}: {
  node: TreeNode;
  depth: number;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const p = node.product;
  const badge = PRODUCT_STATUS_BADGE[(p.status ?? 'active') as ProductStatus];

  return (
    <>
      <div
        className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 hover:bg-muted/50"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => p.id && onSelect(p.id)}
      >
        {node.children.length > 0 ? (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="flex items-center gap-1.5 min-w-0">
          {p.type === 'service' ? (
            <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <Package className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-medium">{p.name}</span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {p.category ? <span>{p.category}</span> : null}
          {badge ? (
            <Badge variant={badge.variant} className="text-[10px]">
              {t(badge.label)}
            </Badge>
          ) : null}
        </span>
      </div>
      {node.children.map((child) => (
        <TreeNodeRow
          key={child.product['@id']}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

export function ProductsListPage() {
  useLiveResource('products');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const { result, query } = useList<P>({
    resource: 'products',
    sorters: [{ field: 'position', order: 'asc' }, { field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
  });

  const products = result?.data ?? [];

  const tree = useMemo(() => {
    let filtered = products;
    if (typeFilter !== 'all') {
      filtered = filtered.filter((p) => p.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.name ?? '').toLowerCase().includes(q) ||
          (p.category ?? '').toLowerCase().includes(q),
      );
    }
    return buildTree(filtered);
  }, [products, typeFilter, search]);

  const isLoading = query.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl">
          <Package className="size-6 text-muted-foreground" /> {t('product_list.title')}
        </h2>
        <Button asChild>
          <Link to="/produkte/create">
            <Plus className="size-4" /> {t('product_list.new')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="gap-3">
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
            <div className="flex gap-1 rounded-md border p-0.5">
              {(['all', 'product', 'service'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTypeFilter(v)}
                  className={`rounded-sm px-3 py-1 text-xs font-medium ${
                    typeFilter === v
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {v === 'all' ? t('product_list.all_types') : t(PRODUCT_TYPE_LABEL[v as ProductType])}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-1 p-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : tree.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {products.length === 0 ? t('product_list.empty') : t('product_list.no_matches')}
            </p>
          ) : (
            <div>
              {tree.map((node) => (
                <TreeNodeRow
                  key={node.product['@id']}
                  node={node}
                  depth={0}
                  onSelect={(id) => navigate(`/produkte/${id}`)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
