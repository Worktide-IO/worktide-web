import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, ClipboardList, Inbox, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { formatDateTime } from '@/lib/intl';
import type { Row } from '@/lib/refine';
import { LocalizedFields, type TranslationsMap } from '@/components/LocalizedFields';
import { useSupportedLanguages, useLocalize, usePrimaryLocale, languageLabel } from '@/lib/languages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type FormRow = Row<{
  '@id': string;
  id?: string;
  slug: string;
  title: string;
  description?: string | null;
  successMessage?: string | null;
  enabled: boolean;
  project?: string | null; // target-project IRI (task landing) or null
  recipients?: string[]; // customer IRIs the form is distributed to
  submissionLimit?: number | null;
  submissionCount?: number;
  translations?: TranslationsMap | null;
  schemaVersion?: number;
  fields?: FormBlock[];
  schema?: { pages?: { id?: string; title?: string | null; blocks?: FormBlock[] }[]; logic?: unknown[]; calc?: unknown[] } | null;
}>;

/** One editable form field. Unknown keys (section, min/max, rows, …) are preserved on round-trip. */
type FormBlock = {
  id?: string;
  key: string;
  type: string;
  label: string;
  labelI18n?: Record<string, string>;
  required?: boolean;
  options?: string[];
  optionsI18n?: Record<string, string[]>; // per-locale option labels (index-aligned)
  rows?: string[]; // matrix row labels
  rowsI18n?: Record<string, string[]>; // per-locale matrix row labels (index-aligned)
  section?: string | null; // groups fields into pages/sections
  placeholder?: string | null;
  mapsTo?: string | null;
  [k: string]: unknown;
};

type CustomerRow = Row<{ '@id': string; id?: string; name: string }>;
type ProjectRow = Row<{ '@id': string; id?: string; name: string }>;
type SubmissionRow = Row<{
  '@id': string;
  id?: string;
  payload: Record<string, unknown>;
  createdTask?: string | null;
  createdAt?: string;
}>;

type FormState = {
  id?: string;
  slug: string;
  title: string;
  description: string;
  successMessage: string;
  enabled: boolean;
  projectIri: string | null;
  recipientIris: string[];
  submissionLimit: string; // '' = unlimited
  translations: TranslationsMap;
  blocks: FormBlock[];
  isV2: boolean; // form stored as v2 schema (vs. legacy flat fields)
  logicRules: LogicRule[]; // editable show/hide branching rules
  logicOther: unknown[]; // other logic rules (e.g. jump) — preserved untouched
  calc: unknown[]; // computed-field rules — preserved untouched (no UI yet)
};

/** A branching atom: a field's value tested against `op` (+ `value`). */
type LogicAtom = { field: string; op: string; value?: string };
/** if all/any of the atoms hold, show/hide the target field. */
type LogicRule = { if: { all?: LogicAtom[]; any?: LogicAtom[] }; then: { action: string; target: string } };

const NO_PROJECT = '__none__';
const NO_MAP = '__nomap__';
const LABEL_BASE = '__base__'; // field-label language selector: edit the base label
const LOGIC_OPS = ['eq', 'neq', 'contains', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'] as const;
const NO_VALUE_OPS = new Set(['empty', 'not_empty']);
const LOGIC_ACTIONS = ['show', 'hide'] as const;

/** Field types the portal renderer + backend accept (mirror of INPUT_TYPES). */
const FIELD_TYPE_KEYS = [
  'text', 'long_text', 'email', 'url', 'number', 'date', 'boolean',
  'select', 'multi_select', 'rating', 'scale', 'matrix', 'file',
] as const;
const OPTION_TYPES = new Set(['select', 'multi_select']);
/** Native task fields a submitted value can route to. */
const MAPS_TO_KEYS = ['title', 'description', 'priority'] as const;

const BLANK: FormState = {
  slug: '',
  title: '',
  description: '',
  successMessage: '',
  enabled: true,
  projectIri: null,
  recipientIris: [],
  submissionLimit: '',
  translations: {},
  blocks: [],
  isV2: false,
  logicRules: [],
  logicOther: [],
  calc: [],
};

const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60);

const genId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `b-${Math.round(performance.now() * 1e6)}`;

/** An editable show/hide rule if its action is show/hide; else null (preserved as-is). */
function asEditableRule(raw: unknown): LogicRule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { if?: unknown; then?: { action?: unknown } };
  const action = r.then?.action;
  return action === 'show' || action === 'hide' ? (raw as LogicRule) : null;
}

function splitLogic(logic: unknown[]): { logicRules: LogicRule[]; logicOther: unknown[] } {
  const logicRules: LogicRule[] = [];
  const logicOther: unknown[] = [];
  for (const raw of logic) {
    const rule = asEditableRule(raw);
    if (rule) logicRules.push(rule);
    else logicOther.push(raw);
  }
  return { logicRules, logicOther };
}

/** Flatten a form's fields into an editable block list, preserving its storage format. */
function readBlocks(r: FormRow): Pick<FormState, 'blocks' | 'isV2' | 'logicRules' | 'logicOther' | 'calc'> {
  const schema = r.schema;
  if (r.schemaVersion === 2 && schema && Array.isArray(schema.pages)) {
    // Stamp each block with its page title as `section` so page grouping
    // round-trips; ensure a stable id so logic rules can target it.
    const blocks = schema.pages.flatMap((p) =>
      (Array.isArray(p?.blocks) ? p.blocks : []).map((b) => ({
        ...b,
        id: (b.id as string) || genId(),
        section: b.section ?? p.title ?? '',
      })),
    );
    return {
      blocks,
      isV2: true,
      ...splitLogic(Array.isArray(schema.logic) ? schema.logic : []),
      calc: Array.isArray(schema.calc) ? schema.calc : [],
    };
  }
  // v1 fields may lack ids; assign stable ones so logic targeting works.
  const blocks = (Array.isArray(r.fields) ? r.fields : []).map((b) => ({ ...b, id: (b.id as string) || genId() }));
  return { blocks, isV2: false, logicRules: [], logicOther: [], calc: [] };
}

/**
 * Group the flat block list into v2 pages by `section` (first-seen order) — the
 * same grouping the backend's fromLegacyFields does for v1, so behaviour is
 * identical whether saved as v1 fields or a v2 schema.
 */
function buildPages(blocks: FormBlock[]): { id: string; title: string | null; blocks: FormBlock[] }[] {
  const bySection = new Map<string, { id: string; title: string | null; blocks: FormBlock[] }>();
  const order: string[] = [];
  for (const b of blocks) {
    const sec = ((b.section as string) ?? '').trim();
    if (!bySection.has(sec)) {
      bySection.set(sec, { id: `p${order.length + 1}`, title: sec === '' ? null : sec, blocks: [] });
      order.push(sec);
    }
    bySection.get(sec)!.blocks.push(b);
  }
  return order.length === 0 ? [{ id: 'p1', title: null, blocks: [] }] : order.map((s) => bySection.get(s)!);
}

/**
 * Global questionnaire management (roadmap §8 forms / Piece B1). Forms are a
 * workspace-global resource distributed to 0..N customers (0 = staff-only,
 * still reachable via the public slug). This edits metadata + distribution +
 * translations; the field/logic builder is a follow-up (B2), so field editing
 * is not here yet — new forms start empty. Mirrors the direct-api CRUD pattern
 * of MeetingTypesPage.
 */
export function FormsPage() {
  const { t } = useTranslation();
  const { languages } = useSupportedLanguages();
  const localize = useLocalize();
  const { result, query } = useList<FormRow>({
    resource: 'public_forms',
    pagination: { mode: 'off' },
    sorters: [{ field: 'title', order: 'asc' }],
  });
  const { result: customers } = useList<CustomerRow>({
    resource: 'customers',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });
  const { result: projects } = useList<ProjectRow>({
    resource: 'projects',
    pagination: { mode: 'off' },
    sorters: [{ field: 'name', order: 'asc' }],
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  // Submissions inbox: the form whose submissions are shown (null = closed).
  const [submissionsFor, setSubmissionsFor] = useState<FormRow | null>(null);
  const { result: subs, query: subsQuery } = useList<SubmissionRow>({
    resource: 'public_form_submissions',
    filters: submissionsFor ? [{ field: 'form', operator: 'eq', value: submissionsFor['@id'] }] : [],
    sorters: [{ field: 'createdAt', order: 'desc' }],
    pagination: { mode: 'off' },
    queryOptions: { enabled: !!submissionsFor },
  });
  // Field-label translation: which language the field-label inputs edit.
  const primaryLocale = usePrimaryLocale();
  const otherLocales = languages.filter((l) => l && l !== primaryLocale);
  const [fieldLang, setFieldLang] = useState<string>(LABEL_BASE);

  const rows = result?.data ?? [];
  const customerName = (iri: string) =>
    (customers?.data ?? []).find((c) => c['@id'] === iri)?.name ?? iri;
  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const save = async () => {
    if (!form) return;
    const slug = form.slug.trim() || slugify(form.title);
    if (!form.title.trim() || !/^[a-z0-9-]{1,60}$/.test(slug)) {
      toast.error(t('toast.title_slug_required'));
      return;
    }
    setBusy(true);
    const limit = form.submissionLimit.trim() === '' ? null : Math.max(0, Number(form.submissionLimit));
    // Normalize the edited blocks: ensure id + key, drop options for non-option
    // types, preserve any advanced keys (section, min/max, rows, prefillFrom).
    const blocks = form.blocks.map((b, i) => ({
      ...b,
      id: b.id || genId(),
      key: b.key?.trim() || slugify(b.label) || `field_${i + 1}`,
      type: b.type || 'text',
      label: b.label ?? '',
      required: !!b.required,
      options: OPTION_TYPES.has(b.type) ? (b.options ?? []) : [],
      mapsTo: b.mapsTo || null,
    }));
    const payload: Record<string, unknown> = {
      slug,
      title: form.title.trim(),
      description: form.description.trim() || null,
      successMessage: form.successMessage.trim() || null,
      isEnabled: form.enabled,
      project: form.projectIri,
      recipients: form.recipientIris,
      submissionLimit: limit,
      translations: form.translations,
    };
    // Logic/calc live only in the v2 schema, so save v2 when the form is already
    // v2 or uses any advanced feature; blocks group into pages by section (same
    // grouping the backend applies to v1 fields). Otherwise keep the flat v1
    // fields (with per-block `section`).
    const logic = [...form.logicRules, ...form.logicOther];
    const needsV2 = form.isV2 || logic.length > 0 || form.calc.length > 0;
    if (needsV2) {
      payload.schema = { version: 2, pages: buildPages(blocks), logic, calc: form.calc };
      payload.schemaVersion = 2;
      payload.fields = [];
    } else {
      payload.fields = blocks;
    }
    try {
      if (form.id) {
        await api.patch(`/public_forms/${form.id}`, payload, {
          headers: { 'Content-Type': 'application/merge-patch+json' },
        });
      } else {
        await api.post('/public_forms', { ...payload, workspace: workspaceIri });
      }
      toast.success(t('toast.saved'));
      setForm(null);
      await query.refetch();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      toast.error(status === 422 ? t('toast.slug_taken') : t('toast.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: FormRow) => {
    if (!r.id || !window.confirm(t('forms.confirm_delete', { title: r.title }))) return;
    try {
      await api.delete(`/public_forms/${r.id}`);
      toast.success(t('toast.deleted'));
      await query.refetch();
    } catch {
      toast.error(t('toast.delete_failed'));
    }
  };

  const toggleRecipient = (iri: string) =>
    setForm((f) =>
      f
        ? {
            ...f,
            recipientIris: f.recipientIris.includes(iri)
              ? f.recipientIris.filter((x) => x !== iri)
              : [...f.recipientIris, iri],
          }
        : f,
    );

  const updateBlock = (i: number, patch: Partial<FormBlock>) =>
    setForm((f) => (f ? { ...f, blocks: f.blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)) } : f));
  const addBlock = () =>
    setForm((f) =>
      f ? { ...f, blocks: [...f.blocks, { id: genId(), key: '', type: 'text', label: '', required: false }] } : f,
    );
  const removeBlock = (i: number) =>
    setForm((f) => (f ? { ...f, blocks: f.blocks.filter((_, j) => j !== i) } : f));
  const setBlockLabelI18n = (i: number, locale: string, raw: string) =>
    setForm((f) => {
      if (!f) return f;
      const blocks = f.blocks.map((b, j) => {
        if (j !== i) return b;
        const li: Record<string, string> = { ...(b.labelI18n ?? {}) };
        if (raw.trim() === '') delete li[locale];
        else li[locale] = raw;
        return { ...b, labelI18n: li };
      });
      return { ...f, blocks };
    });
  const setBlockOptionsI18n = (i: number, locale: string, list: string[]) =>
    setForm((f) => {
      if (!f) return f;
      const blocks = f.blocks.map((b, j) => {
        if (j !== i) return b;
        const oi: Record<string, string[]> = { ...(b.optionsI18n ?? {}) };
        if (list.length === 0) delete oi[locale];
        else oi[locale] = list;
        return { ...b, optionsI18n: oi };
      });
      return { ...f, blocks };
    });
  const setBlockRowsI18n = (i: number, locale: string, list: string[]) =>
    setForm((f) => {
      if (!f) return f;
      const blocks = f.blocks.map((b, j) => {
        if (j !== i) return b;
        const ri: Record<string, string[]> = { ...(b.rowsI18n ?? {}) };
        if (list.length === 0) delete ri[locale];
        else ri[locale] = list;
        return { ...b, rowsI18n: ri };
      });
      return { ...f, blocks };
    });

  // --- branching logic (show/hide rules) ---
  // atom `field` matches an answer (block KEY); a rule `target` matches a block
  // by ID (see the portal engine's isVisible) — so the two selects differ.
  const fieldOptions = (form?.blocks ?? [])
    .map((b) => ({ id: (b.id as string) || '', key: b.key?.trim() || slugify(b.label), label: b.label || b.key || '' }))
    .filter((o) => o.key);
  const atomsOf = (rule: LogicRule): LogicAtom[] => rule.if.all ?? rule.if.any ?? [];
  const patchRule = (ri: number, next: LogicRule) =>
    setForm((f) => (f ? { ...f, logicRules: f.logicRules.map((r, j) => (j === ri ? next : r)) } : f));
  const addRule = () =>
    setForm((f) =>
      f
        ? { ...f, logicRules: [...f.logicRules, { if: { all: [{ field: '', op: 'eq', value: '' }] }, then: { action: 'show', target: '' } }] }
        : f,
    );
  const removeRule = (ri: number) =>
    setForm((f) => (f ? { ...f, logicRules: f.logicRules.filter((_, j) => j !== ri) } : f));
  const setRuleAtoms = (ri: number, rule: LogicRule, atoms: LogicAtom[]) => {
    const mode = rule.if.any ? 'any' : 'all';
    patchRule(ri, { ...rule, if: mode === 'any' ? { any: atoms } : { all: atoms } });
  };
  const setMatchMode = (ri: number, rule: LogicRule, mode: string) =>
    patchRule(ri, { ...rule, if: mode === 'any' ? { any: atomsOf(rule) } : { all: atomsOf(rule) } });
  const updateAtom = (ri: number, rule: LogicRule, ai: number, patch: Partial<LogicAtom>) =>
    setRuleAtoms(ri, rule, atomsOf(rule).map((a, j) => (j === ai ? { ...a, ...patch } : a)));
  const addAtom = (ri: number, rule: LogicRule) =>
    setRuleAtoms(ri, rule, [...atomsOf(rule), { field: '', op: 'eq', value: '' }]);
  const removeAtom = (ri: number, rule: LogicRule, ai: number) =>
    setRuleAtoms(ri, rule, atomsOf(rule).filter((_, j) => j !== ai));
  const moveBlock = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      if (!f) return f;
      const j = i + dir;
      if (j < 0 || j >= f.blocks.length) return f;
      const b = [...f.blocks];
      [b[i], b[j]] = [b[j], b[i]];
      return { ...f, blocks: b };
    });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl">
            <ClipboardList className="size-6 text-muted-foreground" /> {t('forms.heading')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('forms.subtitle')}</p>
        </div>
        <Button type="button" onClick={() => setForm({ ...BLANK })}>
          <Plus className="size-4" /> {t('forms.new')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('forms.count', { count: rows.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('forms.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('forms.col_title')}</TableHead>
                  <TableHead className="w-40">{t('forms.col_recipients')}</TableHead>
                  <TableHead className="w-24">{t('forms.col_submissions')}</TableHead>
                  <TableHead className="w-24">{t('forms.col_status')}</TableHead>
                  <TableHead className="w-24 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const recipients = r.recipients ?? [];
                  return (
                    <TableRow key={r['@id']}>
                      <TableCell>
                        <div className="font-medium">{localize(r, 'title')}</div>
                        <div className="text-xs text-muted-foreground">/{r.slug}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {recipients.length === 0 ? (
                          <span className="text-muted-foreground">{t('forms.staff_only')}</span>
                        ) : (
                          t('forms.recipient_count', { count: recipients.length })
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.submissionCount ?? 0}
                        {r.submissionLimit ? ` / ${r.submissionLimit}` : ''}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.enabled ? 'secondary' : 'outline'} className="text-[10px]">
                          {r.enabled ? t('forms.active') : t('forms.inactive')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7"
                            title={t('forms.view_submissions')}
                            onClick={() => setSubmissionsFor(r)}
                          >
                            <Inbox className="size-3" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() =>
                              setForm({
                                id: r.id,
                                slug: r.slug,
                                title: r.title,
                                description: r.description ?? '',
                                successMessage: r.successMessage ?? '',
                                enabled: r.enabled,
                                projectIri: r.project ?? null,
                                recipientIris: r.recipients ?? [],
                                submissionLimit: r.submissionLimit != null ? String(r.submissionLimit) : '',
                                translations: r.translations ?? {},
                                ...readBlocks(r),
                              })
                            }
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => remove(r)}>
                            <Trash2 className="size-3" />
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
      </Card>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{form?.id ? t('forms.edit') : t('forms.new')}</DialogTitle>
          </DialogHeader>
          {form ? (
            <div className="space-y-3">
              <LocalizedFields
                fields={[
                  { key: 'title', label: t('forms.col_title') },
                  { key: 'description', label: t('forms.description'), multiline: true },
                  { key: 'successMessage', label: t('forms.success_message'), multiline: true },
                ]}
                locales={languages}
                base={{ title: form.title, description: form.description, successMessage: form.successMessage }}
                onBaseChange={(k, v) => setForm({ ...form, [k]: v } as FormState)}
                translations={form.translations}
                onTranslationsChange={(translations) => setForm({ ...form, translations })}
              />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Slug</Label>
                  <Input
                    value={form.slug}
                    placeholder={t('forms.slug_placeholder')}
                    onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('forms.submission_limit')}</Label>
                  <Input
                    type="number"
                    min={0}
                    placeholder={t('forms.unlimited')}
                    value={form.submissionLimit}
                    onChange={(e) => setForm({ ...form, submissionLimit: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>{t('forms.target_project')}</Label>
                <Select
                  value={form.projectIri ?? NO_PROJECT}
                  onValueChange={(v) => setForm({ ...form, projectIri: v === NO_PROJECT ? null : v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>{t('forms.no_project')}</SelectItem>
                    {(projects?.data ?? []).map((p) => (
                      <SelectItem key={p['@id']} value={p['@id']}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">{t('forms.target_project_hint')}</p>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <Label className="text-xs font-medium text-muted-foreground">{t('forms.recipients')}</Label>
                <p className="text-[11px] text-muted-foreground">{t('forms.recipients_hint')}</p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {(customers?.data ?? []).map((c) => (
                    <label key={c['@id']} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.recipientIris.includes(c['@id'])}
                        onCheckedChange={() => toggleRecipient(c['@id'])}
                      />
                      {c.name}
                    </label>
                  ))}
                  {(customers?.data ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">{t('forms.no_customers')}</p>
                  ) : null}
                </div>
                {form.recipientIris.length === 0 ? (
                  <p className="text-[11px] font-medium text-amber-600">{t('forms.staff_only_note')}</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    {form.recipientIris.map(customerName).join(', ')}
                  </p>
                )}
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-medium text-muted-foreground">{t('forms.fields')}</Label>
                  <div className="flex items-center gap-2">
                    {otherLocales.length > 0 ? (
                      <Select value={fieldLang} onValueChange={setFieldLang}>
                        <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={LABEL_BASE}>
                            {primaryLocale
                              ? `${languageLabel(primaryLocale)} (${t('localized_fields.standard')})`
                              : t('localized_fields.standard')}
                          </SelectItem>
                          {otherLocales.map((l) => (
                            <SelectItem key={l} value={l}>{languageLabel(l)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" className="h-7" onClick={addBlock}>
                      <Plus className="size-3" /> {t('forms.add_field')}
                    </Button>
                  </div>
                </div>
                {form.blocks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('forms.no_fields')}</p>
                ) : null}
                {form.blocks.map((b, i) => (
                  <div key={(b.id as string) ?? i} className="space-y-2 rounded-md border bg-muted/30 p-2">
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="h-8"
                        value={fieldLang === LABEL_BASE ? b.label : (b.labelI18n?.[fieldLang] ?? '')}
                        placeholder={fieldLang === LABEL_BASE ? t('forms.field_label') : (b.label || t('forms.field_label'))}
                        onChange={(e) =>
                          fieldLang === LABEL_BASE
                            ? updateBlock(i, { label: e.target.value })
                            : setBlockLabelI18n(i, fieldLang, e.target.value)
                        }
                      />
                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => moveBlock(i, -1)} disabled={i === 0}>
                        <ChevronUp className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => moveBlock(i, 1)} disabled={i === form.blocks.length - 1}>
                        <ChevronDown className="size-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-destructive" onClick={() => removeBlock(i)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={b.type} onValueChange={(v) => updateBlock(i, { type: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELD_TYPE_KEYS.map((k) => (
                            <SelectItem key={k} value={k}>{t(`forms.ftype.${k}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={(b.mapsTo as string) ?? NO_MAP} onValueChange={(v) => updateBlock(i, { mapsTo: v === NO_MAP ? null : v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_MAP}>{t('forms.maps_to_none')}</SelectItem>
                          {MAPS_TO_KEYS.map((k) => (
                            <SelectItem key={k} value={k}>{t(`forms.map.${k}`)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {OPTION_TYPES.has(b.type) || b.type === 'matrix' ? (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{t('forms.options_label')}</Label>
                        <Textarea
                          rows={2}
                          className="text-sm"
                          value={(fieldLang === LABEL_BASE ? (b.options ?? []) : (b.optionsI18n?.[fieldLang] ?? [])).join('\n')}
                          placeholder={fieldLang === LABEL_BASE ? t('forms.options_hint') : (b.options ?? []).join(', ')}
                          onChange={(e) => {
                            const list = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                            if (fieldLang === LABEL_BASE) updateBlock(i, { options: list });
                            else setBlockOptionsI18n(i, fieldLang, list);
                          }}
                        />
                      </div>
                    ) : null}
                    {b.type === 'matrix' ? (
                      <div className="space-y-1">
                        <Label className="text-[11px] text-muted-foreground">{t('forms.rows_label')}</Label>
                        <Textarea
                          rows={2}
                          className="text-sm"
                          value={(fieldLang === LABEL_BASE ? (b.rows ?? []) : (b.rowsI18n?.[fieldLang] ?? [])).join('\n')}
                          placeholder={fieldLang === LABEL_BASE ? t('forms.rows_hint') : (b.rows ?? []).join(', ')}
                          onChange={(e) => {
                            const list = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                            if (fieldLang === LABEL_BASE) updateBlock(i, { rows: list });
                            else setBlockRowsI18n(i, fieldLang, list);
                          }}
                        />
                      </div>
                    ) : null}
                    <div className="flex items-center gap-3">
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox checked={!!b.required} onCheckedChange={() => updateBlock(i, { required: !b.required })} />
                        {t('forms.required')}
                      </label>
                      {fieldLang === LABEL_BASE ? (
                        <div className="flex flex-1 items-center gap-2">
                          <Label className="text-[11px] text-muted-foreground">{t('forms.section')}</Label>
                          <Input
                            className="h-7 text-sm"
                            value={(b.section as string) ?? ''}
                            placeholder={t('forms.section_placeholder')}
                            onChange={(e) => updateBlock(i, { section: e.target.value })}
                          />
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-muted-foreground">{t('forms.fields_hint')}</p>
              </div>

              <div className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground">{t('forms.logic')}</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7" onClick={addRule}>
                    <Plus className="size-3" /> {t('forms.add_rule')}
                  </Button>
                </div>
                {form.logicRules.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('forms.no_rules')}</p>
                ) : null}
                {form.logicRules.map((rule, ri) => {
                  const mode = rule.if.any ? 'any' : 'all';
                  const atoms = atomsOf(rule);
                  return (
                    <div key={ri} className="space-y-2 rounded-md border bg-muted/30 p-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t('forms.logic_when')}
                        <Select value={mode} onValueChange={(v) => setMatchMode(ri, rule, v)}>
                          <SelectTrigger className="h-7 w-24"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{t('forms.match_all')}</SelectItem>
                            <SelectItem value="any">{t('forms.match_any')}</SelectItem>
                          </SelectContent>
                        </Select>
                        {t('forms.logic_conditions')}
                        <Button type="button" variant="ghost" size="icon" className="ml-auto size-7 text-destructive" onClick={() => removeRule(ri)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                      {atoms.map((a, ai) => (
                        <div key={ai} className="flex items-center gap-1.5">
                          <Select value={a.field} onValueChange={(v) => updateAtom(ri, rule, ai, { field: v })}>
                            <SelectTrigger className="h-8 flex-1"><SelectValue placeholder={t('forms.logic_field')} /></SelectTrigger>
                            <SelectContent>
                              {fieldOptions.map((o) => <SelectItem key={o.key} value={o.key}>{o.label ? `${o.label} · ${o.key}` : o.key}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={a.op} onValueChange={(v) => updateAtom(ri, rule, ai, { op: v })}>
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {LOGIC_OPS.map((op) => <SelectItem key={op} value={op}>{t(`forms.op.${op}`)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {!NO_VALUE_OPS.has(a.op) ? (
                            <Input className="h-8 flex-1" value={a.value ?? ''} placeholder={t('forms.logic_value')} onChange={(e) => updateAtom(ri, rule, ai, { value: e.target.value })} />
                          ) : null}
                          <Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => removeAtom(ri, rule, ai)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => addAtom(ri, rule)}>
                        <Plus className="size-3" /> {t('forms.add_condition')}
                      </Button>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {t('forms.logic_then')}
                        <Select value={rule.then.action} onValueChange={(v) => patchRule(ri, { ...rule, then: { ...rule.then, action: v } })}>
                          <SelectTrigger className="h-7 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {LOGIC_ACTIONS.map((act) => <SelectItem key={act} value={act}>{t(`forms.act.${act}`)}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Select value={rule.then.target} onValueChange={(v) => patchRule(ri, { ...rule, then: { ...rule.then, target: v } })}>
                          <SelectTrigger className="h-7 flex-1"><SelectValue placeholder={t('forms.logic_field')} /></SelectTrigger>
                          <SelectContent>
                            {fieldOptions.filter((o) => o.id).map((o) => <SelectItem key={o.id} value={o.id}>{o.label ? `${o.label} · ${o.key}` : o.key}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
                {form.logicOther.length > 0 ? (
                  <p className="text-[11px] text-muted-foreground">{t('forms.logic_other_preserved', { count: form.logicOther.length })}</p>
                ) : null}
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="form-enabled">{t('forms.active_enabled')}</Label>
                <Switch id="form-enabled" checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={busy}>{t('action.cancel')}</Button>
            <Button type="button" onClick={save} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null} {t('action.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submissions inbox — read the stored PublicFormSubmission rows (incl.
          project-less forms that never created a task). */}
      <Dialog open={submissionsFor !== null} onOpenChange={(o) => !o && setSubmissionsFor(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('forms.submissions_title', { title: submissionsFor?.title ?? '' })}</DialogTitle>
          </DialogHeader>
          {subsQuery.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
          ) : (subs?.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('forms.no_submissions')}</p>
          ) : (
            <div className="space-y-3">
              {(subs?.data ?? []).map((s) => (
                <div key={s['@id']} className="rounded-md border p-3">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{s.createdAt ? formatDateTime(s.createdAt) : ''}</span>
                    {s.createdTask ? (
                      <Badge variant="secondary" className="text-[10px]">{t('forms.became_task')}</Badge>
                    ) : null}
                  </div>
                  <dl className="space-y-1">
                    {Object.entries(s.payload ?? {}).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
                        <dt className="truncate text-muted-foreground">{k}</dt>
                        <dd className="break-words">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setSubmissionsFor(null)}>{t('action.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
