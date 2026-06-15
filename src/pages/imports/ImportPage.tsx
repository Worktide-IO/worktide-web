import Papa from 'papaparse';
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

const RESOURCES: { value: Resource; label: string; help: string }[] = [
  { value: 'customers', label: 'Kunden', help: 'CRM-Kundendaten — Name pflicht' },
  {
    value: 'contacts',
    label: 'Kontakte',
    help: 'Ansprechpartner — Customer-Name oder UUID pflicht',
  },
  { value: 'tasks', label: 'Aufgaben', help: 'Tasks — Title pflicht, Projekt-Key optional' },
];

const FIELDS_BY_RESOURCE: Record<Resource, { key: string; label: string; required?: boolean }[]> = {
  customers: [
    { key: 'name', label: 'Name', required: true },
    { key: 'legalName', label: 'Firmen-Langname' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Telefon' },
    { key: 'website', label: 'Website' },
    { key: 'industry', label: 'Branche' },
    { key: 'vatId', label: 'USt-ID' },
    { key: 'addressLine1', label: 'Adresse' },
    { key: 'addressLine2', label: 'Adresszusatz' },
    { key: 'zip', label: 'PLZ' },
    { key: 'city', label: 'Stadt' },
    { key: 'country', label: 'Land (ISO)' },
    { key: 'status', label: 'Status (prospect/active/...)' },
    { key: 'isCompany', label: 'isCompany (true/false)' },
  ],
  contacts: [
    { key: 'firstName', label: 'Vorname' },
    { key: 'lastName', label: 'Nachname' },
    { key: 'customer', label: 'Kunde (Name oder UUID)', required: true },
    { key: 'salutation', label: 'Anrede' },
    { key: 'title', label: 'Titel' },
    { key: 'position', label: 'Position' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Telefon' },
    { key: 'mobile', label: 'Mobil' },
    { key: 'isPrimary', label: 'isPrimary (true/false)' },
  ],
  tasks: [
    { key: 'title', label: 'Titel', required: true },
    { key: 'project', label: 'Projekt-Key (z.B. WORK)' },
    { key: 'status', label: 'Status-Name' },
    { key: 'priority', label: 'Prio (low/normal/high/urgent)' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'identifier', label: 'Identifier' },
    { key: 'dueOn', label: 'Fällig am (YYYY-MM-DD)' },
    { key: 'correlationId', label: 'CorrelationID (UUID, für idempotente Re-Imports)' },
  ],
};

type Step = 1 | 2 | 3;

export function ImportPage() {
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
        toast.error(`CSV-Parsing fehlgeschlagen: ${err.message}`);
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
      toast.error('Validierung fehlgeschlagen.');
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
      toast.error('Import fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl">CSV-Import</h2>
        <StepIndicator step={step} />
      </div>

      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>1. Datei wählen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Ziel</Label>
              <Select value={resource} onValueChange={(v) => setResource(v as Resource)}>
                <SelectTrigger className="max-w-md">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label} — {r.help}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="csv-file">CSV-Datei</Label>
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
                Erste Zeile = Spaltennamen. Max 5.000 Zeilen.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Spalten zuordnen</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              {fileName} — {csvRows.length} Zeilen
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label>
                    {f.label}
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
                      <SelectValue placeholder="— nicht importieren —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— nicht importieren —</SelectItem>
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
                <ArrowLeft className="size-4" /> Zurück
              </Button>
              <Button onClick={() => void runDryRun()} disabled={busy}>
                {busy ? 'Validiere…' : 'Validieren'} <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 && dryRunResult ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Vorschau & Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="default">{dryRunResult.created} importierbar</Badge>
              {dryRunResult.matched && dryRunResult.matched > 0 ? (
                <Badge variant="secondary">
                  {dryRunResult.matched} bereits vorhanden
                </Badge>
              ) : null}
              {dryRunResult.skipped > 0 ? (
                <Badge variant="destructive">
                  {dryRunResult.skipped} mit Fehlern
                </Badge>
              ) : null}
              <span className="text-xs text-muted-foreground">
                Aus {csvRows.length} CSV-Zeilen
              </span>
            </div>

            {dryRunResult.errors.length > 0 ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-2 text-sm font-medium text-destructive">
                  Fehler in {dryRunResult.errors.length} Zeile{dryRunResult.errors.length === 1 ? '' : 'n'}:
                </p>
                <ul className="space-y-1 text-xs">
                  {dryRunResult.errors.slice(0, 20).map((e) => (
                    <li key={e.row} className="font-mono">
                      <span className="text-muted-foreground">Zeile {e.row + 1}:</span> {e.message}
                    </li>
                  ))}
                  {dryRunResult.errors.length > 20 ? (
                    <li className="text-muted-foreground">
                      … und {dryRunResult.errors.length - 20} weitere
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Erste {Math.min(5, csvRows.length)} Zeilen ansehen
              </summary>
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {fields
                        .filter((f) => mapping[f.key])
                        .map((f) => (
                          <TableHead key={f.key}>{f.label}</TableHead>
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
                <ArrowLeft className="size-4" /> Zurück
              </Button>
              <Button
                onClick={() => void runCommit()}
                disabled={busy || dryRunResult.created === 0}
              >
                {busy
                  ? 'Importiere…'
                  : `${dryRunResult.created} Datensätze importieren`}
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
