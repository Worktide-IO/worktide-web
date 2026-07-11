import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, FileSignature, Loader2, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { Row } from '@/lib/refine';
import {
  AGREEMENT_STATUS_BADGE,
  agreementActions,
  type AgreementStatus,
  type AgreementTypeJsonld,
  type CustomerAgreementJsonld,
  SETTABLE_STATUSES,
  toDateInput,
  uploadCustomerFile,
} from '@/lib/agreements';
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
import { Textarea } from '@/components/ui/textarea';

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('de-DE');
}

type EditState = {
  type: Row<AgreementTypeJsonld>;
  status: AgreementStatus;
  signedOn: string;
  validUntil: string;
  reference: string;
  notes: string;
  attachment: File | null;
};

/**
 * Per-customer contract overview: one row per configured AgreementType
 * (SLA, AV, NDA, …) with its current status at a glance, plus a dialog to
 * record/update an agreement via the slug convenience endpoint
 * (`PUT /customers/{id}/agreements/{slug}`). Mandatory types that aren't
 * signed are flagged.
 */
export function CustomerAgreementsTab({
  customerId,
  customerIri,
}: {
  customerId: string;
  customerIri: string;
}) {
  const { t } = useTranslation();
  const { result: types, query: typesQuery } = useList<Row<AgreementTypeJsonld>>({
    resource: 'agreement_types',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });
  const { result: agreements, query: agreementsQuery } = useList<Row<CustomerAgreementJsonld>>({
    resource: 'customer_agreements',
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: Boolean(customerIri) },
  });

  const bySlug = useMemo(() => {
    const map: Record<string, Row<CustomerAgreementJsonld>> = {};
    for (const a of agreements?.data ?? []) {
      if (a.typeSlug) map[a.typeSlug] = a;
    }
    return map;
  }, [agreements]);

  const visibleTypes = useMemo(
    () => (types?.data ?? []).filter((t) => t.isArchived !== true),
    [types],
  );

  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);

  const openEdit = (type: Row<AgreementTypeJsonld>) => {
    const head = bySlug[type.slug];
    setEdit({
      type,
      status: (head?.status && head.status !== 'none' ? head.status : 'signed') as AgreementStatus,
      signedOn: toDateInput(head?.signedOn),
      validUntil: toDateInput(head?.validUntil),
      reference: '',
      notes: head?.notes ?? '',
      attachment: null,
    });
  };

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      let fileId: string | null = null;
      if (edit.attachment) {
        const uploaded = await uploadCustomerFile(
          customerId,
          edit.attachment,
          `${edit.type.name} — ${edit.attachment.name}`,
        );
        fileId = uploaded.id;
      }
      await agreementActions.set(customerId, edit.type.slug, {
        status: edit.status,
        signedOn: edit.signedOn || null,
        validUntil: edit.validUntil || null,
        reference: edit.reference || null,
        notes: edit.notes || null,
        fileId,
      });
      toast.success(t('toast.updated_named', { name: edit.type.name }));
      setEdit(null);
      await agreementsQuery.refetch();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        t('customer_agreements.save_failed');
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const isLoading = typesQuery.isLoading || agreementsQuery.isLoading;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSignature className="size-4 text-muted-foreground" /> {t('customer_agreements.heading')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : visibleTypes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t('customer_agreements.empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('customer_agreements.col_type')}</TableHead>
                <TableHead className="w-44">{t('customer_agreements.status')}</TableHead>
                <TableHead className="w-32">{t('customer_agreements.col_signed')}</TableHead>
                <TableHead className="w-32">{t('customer_agreements.valid_until')}</TableHead>
                <TableHead className="w-28 text-right" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTypes.map((type) => {
                const head = bySlug[type.slug];
                const status = (head?.status ?? 'none') as AgreementStatus;
                const badge = AGREEMENT_STATUS_BADGE[status];
                const missingMandatory = type.isMandatory === true && status !== 'signed';
                return (
                  <TableRow key={type['@id']}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {status === 'signed' ? (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        ) : missingMandatory ? (
                          <AlertTriangle className="size-4 text-amber-500" />
                        ) : null}
                        {type.name}
                        {type.isMandatory ? (
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {t('customer_agreements.mandatory')}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className="text-[10px]">
                        {t(badge.label)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(head?.signedOn)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(head?.validUntil)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => openEdit(type)}
                      >
                        <Pencil className="size-3" />
                        {status === 'none' ? t('customer_agreements.record') : t('action.edit')}
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
            <DialogTitle>{edit?.type.name}</DialogTitle>
            <DialogDescription>
              {t('customer_agreements.dialog_desc')}
            </DialogDescription>
          </DialogHeader>

          {edit ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('customer_agreements.status')}</Label>
                <Select
                  value={edit.status}
                  onValueChange={(v) => setEdit({ ...edit, status: v as AgreementStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTABLE_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {t(s.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="agr-signed">{t('customer_agreements.signed_on')}</Label>
                  <Input
                    id="agr-signed"
                    type="date"
                    value={edit.signedOn}
                    onChange={(e) => setEdit({ ...edit, signedOn: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agr-valid">{t('customer_agreements.valid_until')}</Label>
                  <Input
                    id="agr-valid"
                    type="date"
                    value={edit.validUntil}
                    onChange={(e) => setEdit({ ...edit, validUntil: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agr-ref">{t('customer_agreements.reference')}</Label>
                <Input
                  id="agr-ref"
                  value={edit.reference}
                  onChange={(e) => setEdit({ ...edit, reference: e.target.value })}
                  placeholder={t('customer_agreements.reference_ph')}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agr-notes">{t('customer_agreements.notes')}</Label>
                <Textarea
                  id="agr-notes"
                  rows={2}
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agr-file">{t('customer_agreements.document')}</Label>
                <Input
                  id="agr-file"
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) =>
                    setEdit({ ...edit, attachment: e.target.files?.[0] ?? null })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {edit.attachment
                    ? t('customer_agreements.file_selected', { name: edit.attachment.name })
                    : t('customer_agreements.file_hint')}
                </p>
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setEdit(null)} disabled={saving}>
              {t('action.cancel')}
            </Button>
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
