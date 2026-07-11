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
      toast.success(`${edit.type.name} aktualisiert.`);
      setEdit(null);
      await agreementsQuery.refetch();
    } catch (e) {
      const msg =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        'Speichern fehlgeschlagen.';
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
          <FileSignature className="size-4 text-muted-foreground" /> Verträge
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
            Keine Vertragsarten konfiguriert. Lege welche unter „Vertragsarten" an
            (oder seede SLA/AV/NDA im Backend).
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vertragsart</TableHead>
                <TableHead className="w-44">Status</TableHead>
                <TableHead className="w-32">Unterzeichnet</TableHead>
                <TableHead className="w-32">Gültig bis</TableHead>
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
                            Pflicht
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
                        {status === 'none' ? 'Erfassen' : 'Bearbeiten'}
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
              Vertragsstatus erfassen. Jede Änderung legt eine neue Version an; die
              Historie bleibt erhalten.
            </DialogDescription>
          </DialogHeader>

          {edit ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Status</Label>
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
                  <Label htmlFor="agr-signed">Unterzeichnet am</Label>
                  <Input
                    id="agr-signed"
                    type="date"
                    value={edit.signedOn}
                    onChange={(e) => setEdit({ ...edit, signedOn: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="agr-valid">Gültig bis</Label>
                  <Input
                    id="agr-valid"
                    type="date"
                    value={edit.validUntil}
                    onChange={(e) => setEdit({ ...edit, validUntil: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agr-ref">Referenz / Aktenzeichen</Label>
                <Input
                  id="agr-ref"
                  value={edit.reference}
                  onChange={(e) => setEdit({ ...edit, reference: e.target.value })}
                  placeholder="z. B. Vertragsnummer"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agr-notes">Notiz</Label>
                <Textarea
                  id="agr-notes"
                  rows={2}
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agr-file">Unterzeichnetes Dokument (PDF)</Label>
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
                    ? `Wird im Dokumentenspeicher des Kunden abgelegt: ${edit.attachment.name}`
                    : 'Optional — wird im Dokumentenspeicher des Kunden abgelegt und an diese Version gehängt.'}
                </p>
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
