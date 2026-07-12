import { useList } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, FileSignature, Languages, ListPlus, Loader2, Pencil, Receipt, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { LocalizedFields, type TranslationsMap } from '@/components/LocalizedFields';
import { useSupportedLanguages, useLocalize, usePrimaryLocale, languageLabel } from '@/lib/languages';
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
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(intlLocale());
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

type LineItem = {
  id?: string;
  description: string;
  quantity: number;
  unitAmountCents: number;
  currency: string;
  isRecurring: boolean;
  translations: TranslationsMap;
};

const LINE_LANG_BASE = '__base__';

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

  // Agreement types are WORKSPACE-GLOBAL config (shared across all customers);
  // this tab only *applies* a type to this customer. The "manage types" dialog
  // edits the type itself (name/description + translations) — a change here
  // affects every customer's rows.
  const { languages } = useSupportedLanguages();
  const localize = useLocalize();
  const [typesOpen, setTypesOpen] = useState(false);
  const [typeEdit, setTypeEdit] = useState<{
    id: string;
    name: string;
    description: string;
    translations: TranslationsMap;
  } | null>(null);
  const [savingType, setSavingType] = useState(false);

  // Per-contract line-item editor (edits the in-force revision's lines in place).
  const primaryLocale = usePrimaryLocale();
  const otherLocales = languages.filter((l) => l && l !== primaryLocale);
  const [linesFor, setLinesFor] = useState<Row<AgreementTypeJsonld> | null>(null);
  const [lines, setLines] = useState<LineItem[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);
  const [savingLines, setSavingLines] = useState(false);
  const [lineLang, setLineLang] = useState<string>(LINE_LANG_BASE);

  const openLineItems = async (type: Row<AgreementTypeJsonld>) => {
    setLinesFor(type);
    setLines([]);
    setLineLang(LINE_LANG_BASE);
    setLinesLoading(true);
    try {
      const { data } = await api.get<{ lineItems?: LineItem[] }>(
        `/customers/${customerId}/agreements/${type.slug}`,
      );
      setLines(
        (data.lineItems ?? []).map((li) => ({
          id: li.id,
          description: li.description ?? '',
          quantity: li.quantity ?? 1,
          unitAmountCents: li.unitAmountCents ?? 0,
          currency: li.currency ?? 'EUR',
          isRecurring: !!li.isRecurring,
          translations: (li.translations as TranslationsMap | undefined) ?? {},
        })),
      );
    } catch {
      toast.error(t('toast.load_failed'));
    } finally {
      setLinesLoading(false);
    }
  };

  const saveLineItems = async () => {
    if (!linesFor) return;
    setSavingLines(true);
    try {
      await api.put(`/customers/${customerId}/agreements/${linesFor.slug}/line-items`, {
        lineItems: lines.map((l) => ({
          description: l.description.trim(),
          quantity: l.quantity,
          unitAmountCents: l.unitAmountCents,
          currency: l.currency,
          isRecurring: l.isRecurring,
          translations: l.translations,
        })),
      });
      toast.success(t('toast.saved'));
      setLinesFor(null);
      await agreementsQuery.refetch();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(status === 409 ? t('customer_agreements.line_items_need_record') : t('toast.save_failed'));
    } finally {
      setSavingLines(false);
    }
  };

  const updateLine = (i: number, patch: Partial<LineItem>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLine = () =>
    setLines((ls) => [...ls, { description: '', quantity: 1, unitAmountCents: 0, currency: 'EUR', isRecurring: false, translations: {} }]);
  const removeLine = (i: number) => setLines((ls) => ls.filter((_, j) => j !== i));
  const setLineDescI18n = (i: number, locale: string, raw: string) =>
    setLines((ls) =>
      ls.map((l, j) => {
        if (j !== i) return l;
        const desc: Record<string, string> = { ...(l.translations.description ?? {}) };
        if (raw.trim() === '') delete desc[locale];
        else desc[locale] = raw;
        const translations = { ...l.translations };
        if (Object.keys(desc).length === 0) delete translations.description;
        else translations.description = desc;
        return { ...l, translations };
      }),
    );

  const saveType = async () => {
    if (!typeEdit) return;
    if (!typeEdit.name.trim()) {
      toast.error(t('customer_agreements.type_name_required'));
      return;
    }
    setSavingType(true);
    try {
      await api.patch(
        `/agreement_types/${typeEdit.id}`,
        {
          name: typeEdit.name.trim(),
          description: typeEdit.description.trim() || null,
          translations: typeEdit.translations,
        },
        { headers: { 'Content-Type': 'application/merge-patch+json' } },
      );
      toast.success(t('toast.saved'));
      setTypeEdit(null);
      await typesQuery.refetch();
    } catch {
      toast.error(t('toast.save_failed'));
    } finally {
      setSavingType(false);
    }
  };

  const openTypeEdit = (type: Row<AgreementTypeJsonld>) => {
    if (!type.id) return;
    setTypeEdit({
      id: type.id,
      name: type.name,
      description: (type as unknown as { description?: string | null }).description ?? '',
      translations: (type as unknown as { translations?: TranslationsMap }).translations ?? {},
    });
  };

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
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <FileSignature className="size-4 text-muted-foreground" /> {t('customer_agreements.heading')}
          </CardTitle>
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setTypesOpen(true)}>
            <Languages className="size-3" /> {t('customer_agreements.manage_types')}
          </Button>
        </div>
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
                        {localize(type, 'name')}
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
                      <div className="flex justify-end gap-1">
                        {status !== 'none' ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            title={t('customer_agreements.line_items')}
                            onClick={() => openLineItems(type)}
                          >
                            <Receipt className="size-3" />
                          </Button>
                        ) : null}
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
                      </div>
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
            <DialogTitle>{edit ? localize(edit.type, 'name') : ''}</DialogTitle>
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

      {/* Workspace-wide: manage the agreement TYPE catalog (name/description +
          translations). A change here affects every customer's rows. */}
      <Dialog open={typesOpen} onOpenChange={(o) => !o && setTypesOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('customer_agreements.manage_types')}</DialogTitle>
            <DialogDescription>{t('customer_agreements.manage_types_desc')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {(types?.data ?? []).map((type) => (
              <div
                key={type['@id']}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{localize(type, 'name')}</div>
                  <div className="truncate text-xs text-muted-foreground">{type.slug}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0"
                  onClick={() => openTypeEdit(type)}
                >
                  <Pencil className="size-3" /> {t('action.edit')}
                </Button>
              </div>
            ))}
            {(types?.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t('customer_agreements.empty')}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setTypesOpen(false)}>
              {t('action.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single-type editor (workspace-wide). */}
      <Dialog open={typeEdit !== null} onOpenChange={(o) => !o && setTypeEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('customer_agreements.edit_type')}</DialogTitle>
            <DialogDescription>{t('customer_agreements.manage_types_desc')}</DialogDescription>
          </DialogHeader>
          {typeEdit ? (
            <LocalizedFields
              fields={[
                { key: 'name', label: t('customer_agreements.type_name'), autoFocus: true },
                { key: 'description', label: t('customer_agreements.type_description'), multiline: true },
              ]}
              locales={languages}
              base={{ name: typeEdit.name, description: typeEdit.description }}
              onBaseChange={(k, v) => setTypeEdit({ ...typeEdit, [k]: v } as typeof typeEdit)}
              translations={typeEdit.translations}
              onTranslationsChange={(translations) => setTypeEdit({ ...typeEdit, translations })}
            />
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setTypeEdit(null)} disabled={savingType}>
              {t('action.cancel')}
            </Button>
            <Button type="button" onClick={saveType} disabled={savingType}>
              {savingType ? <Loader2 className="size-4 animate-spin" /> : null}
              {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Line-item editor — edits the in-force revision's priced lines in place,
          incl. per-locale description translations (content i18n). */}
      <Dialog open={linesFor !== null} onOpenChange={(o) => !o && setLinesFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('customer_agreements.line_items')}{linesFor ? ` — ${localize(linesFor, 'name')}` : ''}
            </DialogTitle>
            <DialogDescription>{t('customer_agreements.line_items_desc')}</DialogDescription>
          </DialogHeader>

          {linesLoading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                {otherLocales.length > 0 ? (
                  <Select value={lineLang} onValueChange={setLineLang}>
                    <SelectTrigger className="h-8 w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={LINE_LANG_BASE}>
                        {primaryLocale
                          ? `${languageLabel(primaryLocale)} (${t('localized_fields.standard')})`
                          : t('localized_fields.standard')}
                      </SelectItem>
                      {otherLocales.map((l) => (
                        <SelectItem key={l} value={l}>{languageLabel(l)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : <span />}
                <Button type="button" variant="outline" size="sm" className="h-7" onClick={addLine}>
                  <ListPlus className="size-3" /> {t('customer_agreements.add_line')}
                </Button>
              </div>

              {lines.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t('customer_agreements.no_lines')}</p>
              ) : null}

              {lines.map((l, i) => (
                <div key={l.id ?? i} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      className="h-8"
                      placeholder={t('customer_agreements.line_description')}
                      value={lineLang === LINE_LANG_BASE ? l.description : (l.translations.description?.[lineLang] ?? '')}
                      onChange={(e) =>
                        lineLang === LINE_LANG_BASE
                          ? updateLine(i, { description: e.target.value })
                          : setLineDescI18n(i, lineLang, e.target.value)
                      }
                      {...(lineLang !== LINE_LANG_BASE ? { placeholder: l.description || t('customer_agreements.line_description') } : {})}
                    />
                    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-destructive" onClick={() => removeLine(i)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  {lineLang === LINE_LANG_BASE ? (
                    <div className="grid grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{t('customer_agreements.line_qty')}</Label>
                        <Input className="h-8" type="number" min={0} step="0.5" value={l.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{t('customer_agreements.line_unit_price')}</Label>
                        <Input className="h-8" type="number" min={0} step="0.01" value={(l.unitAmountCents / 100).toString()} onChange={(e) => updateLine(i, { unitAmountCents: Math.round(Number(e.target.value) * 100) })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{t('customer_agreements.line_currency')}</Label>
                        <Input className="h-8" maxLength={3} value={l.currency} onChange={(e) => updateLine(i, { currency: e.target.value.toUpperCase() })} />
                      </div>
                      <label className="flex items-end gap-2 pb-1.5 text-xs">
                        <input type="checkbox" checked={l.isRecurring} onChange={(e) => updateLine(i, { isRecurring: e.target.checked })} />
                        {t('customer_agreements.line_recurring')}
                      </label>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setLinesFor(null)} disabled={savingLines}>{t('action.cancel')}</Button>
            <Button type="button" onClick={saveLineItems} disabled={savingLines || linesLoading}>
              {savingLines ? <Loader2 className="size-4 animate-spin" /> : null} {t('action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
