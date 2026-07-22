import { useList } from '@refinedev/core';
import { useLiveResource } from '@/lib/mercure';
import { useTranslation } from 'react-i18next';
import { ChevronRight, FolderPlus, FolderTree, Package, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import type { Row } from '@/lib/refine';
import {
  PRODUCT_STATUS_BADGE,
  type ProductJsonld,
  type ProductStatus,
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
  const [open, setOpen] = useState(true);
  const p = node.product;
  const badge = PRODUCT_STATUS_BADGE[(p.status ?? 'active') as ProductStatus];
  const hasChildren = node.children.length > 0;
  const childCount = hasChildren ? ` (${node.children.length})` : '';
  const currentWsIri = `/v1/workspaces/${localStorage.getItem('wt.workspace') ?? ''}`;
  const isShared = (p.workspace as string | undefined) !== currentWsIri && !!(p.workspace as string | undefined);

  return (
    <div>
      <div
        className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 hover:bg-muted/50"
        style={{ paddingLeft: `${12 + depth * 20}px` }}
        onClick={() => {
          if (hasChildren) setOpen((v) => !v);
          else if (p.id) onSelect(p.id);
        }}
      >
        {hasChildren ? (
          <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        {hasChildren ? (
          <FolderTree className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Package className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {p.name}<span className="text-xs font-normal text-muted-foreground">{childCount}</span>
        </span>
        {badge ? (
          <Badge variant={badge.variant} className="text-[10px] shrink-0">
            {t(badge.label)}
          </Badge>
        ) : null}
        {isShared ? (
          <Badge variant="outline" className="text-[10px] shrink-0">
            {t('product_list.shared')}
          </Badge>
        ) : null}
      </div>
      {open &&
        node.children.map((child) => (
          <TreeNodeRow
            key={child.product['@id']}
            node={child}
            depth={depth + 1}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

export function ProductsListPage() {
  useLiveResource('products');
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  useEffect(() => {
    document.title = `${t('product_list.title')} \u00B7 Worktide`;
  }, [t]);

  const { result, query } = useList<P>({
    resource: 'products',
    filters: [{ field: 'type', operator: 'eq', value: 'product' }],
    sorters: [{ field: 'position', order: 'asc' }, { field: 'name', order: 'asc' }],
    pagination: { mode: 'off' },
  });

  const products = result?.data ?? [];

  const tree = useMemo(() => {
    let filtered = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          (p.name ?? '').toLowerCase().includes(q),
      );
    }
    return buildTree(filtered);
  }, [products, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-2xl">
          <Package className="size-6 text-muted-foreground" /> {t('product_list.title')}
        </h2>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/produkte/create?category=1">
              <FolderPlus className="size-4" /> {t('product_list.new_category')}
            </Link>
          </Button>
          <Button asChild>
            <Link to="/produkte/create">
              <Plus className="size-4" /> {t('product_list.new')}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="relative max-w-md">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={t('product_list.search_name')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {query.isLoading ? (
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
