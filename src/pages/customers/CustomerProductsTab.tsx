import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Boxes, Loader2, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import {
  CUSTOMER_PRODUCT_STATUS_BADGE,
  PRODUCT_TYPE_LABEL,
  type CustomerProductJsonld,
  type CustomerProductStatus,
  type ProductJsonld,
  type ProductType,
  type ProductVersionJsonld,
  toDateInput,
} from '@/lib/catalog';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

type EditState = {
  existing?: Row<CustomerProductJsonld>;
  productIri: string;
  productVersionIri: string;
  status: CustomerProductStatus;
  acquiredAt: string;
  notes: string;
};

/**
 * Products & services assigned to a customer, each pinned to the version the
 * customer currently has. Assign a catalogue item (picking a version for
 * versioned products) or upgrade an existing assignment to a newer version.
 */
export function CustomerProductsTab({ customerIri }: { customerIri: string }) {
  const { t } = useTranslation();
  const { result: assignments, query: assignmentsQuery } = useList<Row<CustomerProductJsonld>>({
    resource: 'customer_products',
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(customerIri) },
  });
  const { result: products } = useList<Row<ProductJsonld>>({
    resource: 'products',
    pagination: { mode: 'off' },
  });
  const { result: versions } = useList<Row<ProductVersionJsonld>>({
    resource: 'product_versions',
    pagination: { mode: 'off' },
  });

  const productByIri = useMemo(() => {
    const m: Record<string, Row<ProductJsonld>> = {};
    for (const p of products?.data ?? []) if (p['@id']) m[p['@id']] = p;
    return m;
  }, [products]);
  const versionByIri = useMemo(() => {
    const m: Record<string, Row<ProductVersionJsonld>> = {};
    for (const v of versions?.data ?? []) if (v['@id']) m[v['@id']] = v;
    return m;
  }, [versions]);
  const versionsByProduct = useMemo(() => {
    const m: Record<string, Row<ProductVersionJsonld>[]> = {};
    for (const v of versions?.data ?? []) {
      if (v.product) (m[v.product] ??= []).push(v);
    }
    return m;
  }, [versions]);

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const openAssign = () =>
    setEdit({ productIri: '', productVersionIri: '', status: 'active', acquiredAt: '', notes: '' });

  const openEdit = (cp: Row<CustomerProductJsonld>) =>
    setEdit({
      existing: cp,
      productIri: cp.product ?? '',
      productVersionIri: cp.productVersion ?? '',
      status: (cp.status ?? 'active') as CustomerProductStatus,
      acquiredAt: toDateInput(cp.acquiredAt),
      notes: cp.notes ?? '',
    });

  const editProduct = edit ? productByIri[edit.productIri] : undefined;
  const editIsVersioned = editProduct?.type === 'product';

  const save = async () => {
    if (!edit) return;
    if (!edit.productIri) {
      toast.error(t('toast.select_product'));
      return;
    }
    if (editIsVersioned && !edit.productVersionIri) {
      toast.error(t('toast.select_version'));
      return;
    }
    setSaving(true);
    try {
      const body = {
        productVersion: editIsVersioned ? edit.productVersionIri : null,
        status: edit.status,
        acquiredAt: edit.acquiredAt || null,
        notes: edit.notes || null,
      };
      if (edit.existing?.id) {
        await api.patch(`/customer_products/${edit.existing.id}`, body, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        await api.post('/customer_products', {
          customer: customerIri,
          product: edit.productIri,
          workspace: workspaceIri,
          ...body,
        });
      }
      toast.success(t('toast.saved'));
      setEdit(null);
      await assignmentsQuery.refetch();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string; description?: string } } })?.response?.data
          ?.detail ?? 'Speichern fehlgeschlagen.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const rows = assignments?.data ?? [];
  const isLoading = assignmentsQuery.isLoading;
  const catalog = products?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Boxes className="size-4 text-muted-foreground" /> Produkte & Services
        </CardTitle>
        <Button type="button" size="sm" onClick={openAssign} disabled={catalog.length === 0}>
          <Plus className="size-4" /> Zuordnen
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : catalog.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Kein Katalog vorhanden. Lege zuerst unter <strong>Produkte &amp; Services</strong> etwas an.
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Diesem Kunden ist noch nichts zugeordnet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produkt / Service</TableHead>
                <TableHead className="w-32">Version</TableHead>
                <TableHead className="w-28">Status</TableHead>
                <TableHead className="w-28 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((cp) => {
                const product = cp.product ? productByIri[cp.product] : undefined;
                const version = cp.productVersion ? versionByIri[cp.productVersion] : undefined;
                const latestIri = product?.latestVersion;
                const behind = version && latestIri && cp.productVersion !== latestIri;
                const badge =
                  CUSTOMER_PRODUCT_STATUS_BADGE[(cp.status ?? 'active') as CustomerProductStatus];
                return (
                  <TableRow key={cp['@id']}>
                    <TableCell className="font-medium">
                      {product?.name ?? '—'}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {product ? t(PRODUCT_TYPE_LABEL[(product.type ?? 'product') as ProductType]) : ''}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {version ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono">{version.version}</span>
                          {behind ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Update verfügbar
                            </Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className="text-[10px]">
                        {t(badge.label)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => openEdit(cp)}
                      >
                        <Pencil className="size-3" /> Bearbeiten
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.existing ? 'Zuordnung bearbeiten' : 'Produkt zuordnen'}</DialogTitle>
            <DialogDescription>
              Produkte werden an eine Version gebunden — ein Upgrade stellt einfach die
              neuere Version ein.
            </DialogDescription>
          </DialogHeader>

          {edit ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Produkt / Service</Label>
                <Select
                  value={edit.productIri}
                  disabled={!!edit.existing}
                  onValueChange={(v) =>
                    setEdit({ ...edit, productIri: v, productVersionIri: '' })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Wählen…" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.map((p) => (
                      <SelectItem key={p['@id']} value={p['@id'] ?? ''}>
                        {p.name} ({t(PRODUCT_TYPE_LABEL[(p.type ?? 'product') as ProductType])})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editIsVersioned ? (
                <div className="space-y-1.5">
                  <Label>Version</Label>
                  <Select
                    value={edit.productVersionIri}
                    onValueChange={(v) => setEdit({ ...edit, productVersionIri: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Version wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(versionsByProduct[edit.productIri] ?? [])
                        .slice()
                        .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
                        .map((v) => (
                          <SelectItem key={v['@id']} value={v['@id'] ?? ''}>
                            {v.version}
                            {v.isLatest ? ' — aktuell' : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={edit.status}
                    onValueChange={(v) => setEdit({ ...edit, status: v as CustomerProductStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Aktiv</SelectItem>
                      <SelectItem value="churned">Beendet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cp-acq">Erworben am</Label>
                  <Input
                    id="cp-acq"
                    type="date"
                    value={edit.acquiredAt}
                    onChange={(e) => setEdit({ ...edit, acquiredAt: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cp-notes">Notiz</Label>
                <Input
                  id="cp-notes"
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEdit(null)} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
