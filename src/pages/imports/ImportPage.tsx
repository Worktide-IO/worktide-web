import Papa from 'papaparse';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, FileSpreadsheet, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type Resource = 'customers' | 'contacts' | 'tasks';

/**
 * Three-step CSV-import wizard.
 *
 *   1. Pick resource + upload file. papaparse reads it client-side
 *      (header row + first 200 rows for preview).
 *   2. Map each CSV column to a target field. Auto-suggest on exact
 *      name match (case-insensitive).
 *   3. Dry-run validates rows, then a final commit POSTs to
 *      /v1/imports/<resource>. Toast surfaces created/skipped/errors.
 *
 * Per-resource the field-catalogue lists the fields the backend's
 * ImportController accepts. We only show those in step 2 — anything
 * else would be silently dropped on the server anyway.
 */

// `label`/`help` hold i18n keys (translated at render) so they follow the
// active language rather than freezing at module-load time.
const RESOURCES: { value: Resource; label: string; help: string }[] = [
  { value: 'customers', label: 'import.res_customers_label', help: 'import.res_customers_help' },
  {
    value: 'contacts',
    label: 'import.res_contacts_label',
    help: 'import.res_contacts_help',
  },
  { value: 'tasks', label: 'import.res_tasks_label', help: 'import.res_tasks_help' },
];

const FIELDS_BY_RESOURCE: Record<Resource, { key: string; label: string; required?: boolean }[]> = {
  customers: [
    { key: 'name', label: 'import.field_name', required: true },
    { key: 'legalName', label: 'import.field_legalName' },
    { key: 'email', label: 'import.field_email' },
    { key: 'phone', label: 'import.field_phone' },
    { key: 'website', label: 'import.field_website' },
    { key: 'industry', label: 'import.field_industry' },
    { key: 'vatId', label: 'import.field_vatId' },
    { key: 'addressLine1', label: 'import.field_addressLine1' },
    { key: 'addressLine2', label: 'import.field_addressLine2' },
    { key: 'zip', label: 'import.field_zip' },
    { key: 'city', label: 'import.field_city' },
    { key: 'country', label: 'import.field_country' },
    { key: 'status', label: 'import.field_status_customer' },
    { key: 'isCompany', label: 'import.field_isCompany' },
  ],
  contacts: [
    { key: 'firstName', label: 'import.field_firstName' },
    { key: 'lastName', label: 'import.field_lastName' },
    { key: 'customer', label: 'import.field_customer', required: true },
    { key: 'salutation', label: 'import.field_salutation' },
    { key: 'title', label: 'import.field_title' },
    { key: 'position', label: 'import.field_position' },
    { key: 'email', label: 'import.field_email' },
    { key: 'phone', label: 'import.field_phone' },
    { key: 'mobile', label: 'import.field_mobile' },
    { key: 'isPrimary', label: 'import.field_isPrimary' },
  ],
  tasks: [
    { key: 'title', label: 'import.field_title', required: true },
    { key: 'project', label: 'import.field_project' },
    { key: 'status', label: 'import.field_status_name' },
    { key: 'priority', label: 'import.field_priority' },
    { key: 'description', label: 'import.field_description' },
    { key: 'identifier', label: 'import.field_identifier' },
    { key: 'dueOn', label: 'import.field_dueOn' },
    { key: 'correlationId', label: 'import.field_correlationId' },
  ],
};

type Step = 1 | 2 | 3;

export function ImportPage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>(1);
  const [resource, setResource] = useState<Resource>('customers');
  const [fileName, setFileName] = useState<string | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<{
    created: number;
    matched?: number;
    skipped: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const fields = FIELDS_BY_RESOURCE[resource];

  const handleFile = (file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = (result.meta.fields ?? []).map((h) => h.trim());
        setCsvHeaders(headers);
        setCsvRows(result.data);
        // Auto-suggest mapping by exact (case-insensitive) header match.
        const next: Record<string, string> = {};
        for (const f of fields) {
          const match = headers.find((h) => h.toLowerCase() === f.key.toLowerCase());
          if (match) next[f.key] = match;
        }
        setMapping(next);
        setStep(2);
      },
      error: (err) => {
        toast.error(t('toast.csv_parse_failed', { msg: err.message }));
      },
    });
  };

  const buildRows = (): Record<string, unknown>[] => {
    return csvRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const f of fields) {
        const src = mapping[f.key];
        if (!src) continue;
        const raw = row[src];
        if (raw === undefined || raw === '') continue;
        if (f.key === 'isCompany' || f.key === 'isPrimary') {
          out[f.key] = ['true', '1', 'yes', 'ja'].includes(String(raw).toLowerCase());
        } else {
          out[f.key] = raw;
        }
      }
      return out;
    });
  };

  const runDryRun = async () => {
    setBusy(true);
    setDryRunResult(null);
    try {
      const rows = buildRows();
      const { data } = await api.post<{
        created: number;
        matched?: number;
        skipped: number;
        errors: { row: number; message: string }[];
      }>(`/imports/${resource}`, { rows, dryRun: true });
      setDryRunResult(data);
      setStep(3);
    } catch (err) {
      console.warn('Import dryRun failed', err);
      toast.error(t('toast.validation_failed'));
    } finally {
      setBusy(false);
    }
  };

  const runCommit = async () => {
    setBusy(true);
    try {
      const rows = buildRows();
      const { data } = await api.post<{
        created: number;
        matched?: number;
        skipped: number;
        errors: { row: number; message: string }[];
      }>(`/imports/${resource}`, { rows, dryRun: false });
      const parts: string[] = [`${data.created} angelegt`];
      if (data.matched && data.matched > 0) {
        parts.push(`${data.matched} bereits vorhanden (korrelations-Match)`);
      }
      if (data.skipped > 0) {
        parts.push(`${data.skipped} übersprungen`);
      }
      toast.success(parts.join(', ') + '.');
      // Reset to step 1 for the next batch.
      setStep(1);
      setFileName(null);
      setCsvHeaders([]);
      setCsvRows([]);
      setMapping({});
      setDryRunResult(null);
    } catch (err) {
      console.warn('Import commit failed', err);
      toast.error(t('toast.import_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl">{t('import.title')}</h2>
        <StepIndicator step={step} />
      </div>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('import.step1_title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t('import.target')}</Label>
              <Select value={resource} onValueChange={(v) => setResource(v as Resource)}>
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {t(r.label)} — {t(r.help)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csv-file">{t('import.csv_file')}</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                  className="max-w-md"
                />
                <Upload className="size-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                {t('import.file_hint')}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('import.step2_title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              {fileName} — {t('import.n_rows', { count: csvRows.length })}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>
                    {t(f.label)}
                    {f.required ? <span className="text-destructive"> *</span> : null}
                  </Label>
                  <Select
                    value={mapping[f.key] ?? '__none__'}
                    onValueChange={(v) =>
                      setMapping((m) => {
                        const next = { ...m };
                        if (v === '__none__') delete next[f.key];
                        else next[f.key] = v;
                        return next;
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('import.dont_import')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('import.dont_import')}</SelectItem>
                      {csvHeaders.map((h) => (
                        <SelectItem key={h} value={h}>
                          {h}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="size-4" /> {t('import.back')}
              </Button>
              <Button onClick={() => void runDryRun()} disabled={busy}>
                {busy ? t('import.validating') : t('import.validate')} <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 && dryRunResult ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('import.step3_title')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="default">{t('import.n_importable', { count: dryRunResult.created })}</Badge>
              {dryRunResult.matched && dryRunResult.matched > 0 ? (
                <Badge variant="secondary">
                  {t('import.n_existing', { count: dryRunResult.matched })}
                </Badge>
              ) : null}
              {dryRunResult.skipped > 0 ? (
                <Badge variant="destructive">
                  {t('import.n_with_errors', { count: dryRunResult.skipped })}
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {t('import.from_n_rows', { count: csvRows.length })}
              </span>
            </div>

            {dryRunResult.errors.length > 0 ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-2 text-sm font-medium text-destructive">
                  {t('import.errors_in_rows', { count: dryRunResult.errors.length })}
                </p>
                <ul className="space-y-1 text-xs">
                  {dryRunResult.errors.slice(0, 20).map((e) => (
                    <li key={e.row} className="font-mono">
                      <span className="text-muted-foreground">{t('import.row_label', { n: e.row + 1 })}</span> {e.message}
                    </li>
                  ))}
                  {dryRunResult.errors.length > 20 ? (
                    <li className="text-muted-foreground">
                      {t('import.and_n_more', { count: dryRunResult.errors.length - 20 })}
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                {t('import.preview_first_rows', { count: Math.min(5, csvRows.length) })}
              </summary>
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {fields
                        .filter((f) => mapping[f.key])
                        .map((f) => (
                          <TableHead key={f.key}>{t(f.label)}</TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.slice(0, 5).map((row, i) => (
                      <TableRow key={i}>
                        {fields
                          .filter((f) => mapping[f.key])
                          .map((f) => (
                            <TableCell key={f.key} className="text-xs">
                              {row[mapping[f.key]] ?? '—'}
                            </TableCell>
                          ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="size-4" /> {t('import.back')}
              </Button>
              <Button
                onClick={() => void runCommit()}
                disabled={busy || dryRunResult.created === 0}
              >
                {busy
                  ? t('import.importing')
                  : t('import.import_n_records', { count: dryRunResult.created })}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`size-6 rounded-full flex items-center justify-center ${
            n === step
              ? 'bg-primary text-primary-foreground font-medium'
              : n < step
                ? 'bg-muted text-foreground'
                : 'bg-muted'
          }`}
        >
          {n}
        </span>
      ))}
    </div>
  );
}
