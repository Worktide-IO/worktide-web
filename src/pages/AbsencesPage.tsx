import { useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { CalendarOff, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
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

type WorkspaceAbsenceRow = Row<{ '@id': string; id?: string; name: string; startsOn: string; endsOn: string }>;
type AbsenceRow = Row<{ '@id': string; id?: string; user: string; type: string; startsOn: string; endsOn: string }>;
type UserRow = Row<{ '@id': string; firstName?: string; lastName?: string; email?: string }>;
type MemberRow = Row<{ '@id': string; user?: string | null }>;
type MeetingTypeRow = Row<{ '@id': string; host?: string | null }>;
type ContactAbsenceRow = Row<{ '@id': string; id?: string; contact: string; customer: string; startsOn: string; endsOn: string; note?: string | null }>;
type ContactRow = Row<{ '@id': string; firstName?: string; lastName?: string }>;
type CustomerRow = Row<{ '@id': string; name?: string }>;

const ABSENCE_TYPES: { value: string; label: string }[] = [
  { value: 'vacation', label: 'Urlaub' },
  { value: 'sick', label: 'Krank' },
  { value: 'training', label: 'Fortbildung' },
  { value: 'other', label: 'Sonstiges' },
];

const typeLabel = (t: string) => ABSENCE_TYPES.find((x) => x.value === t)?.label ?? t;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
// Store at noon so a timezone shift never moves the wall-clock date the slot
// engine reads (it blocks by calendar day).
const atNoon = (isoDate: string) => `${isoDate}T12:00:00`;
const fmtRange = (a: string, b: string) =>
  a === b || a.slice(0, 10) === b.slice(0, 10)
    ? dateFmt.format(new Date(a))
    : `${dateFmt.format(new Date(a))} – ${dateFmt.format(new Date(b))}`;

/**
 * Abwesenheiten — the days people are away, which the booking slot engine blanks
 * out. Two kinds: workspace-wide closures (company holidays, affect everyone) and
 * per-member personal absences (vacation / sick / …).
 */
export function AbsencesPage() {
  const { t: translate } = useTranslation();
  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const { result: closures, query: closuresQ } = useList<WorkspaceAbsenceRow>({
    resource: 'workspace_absences',
    pagination: { mode: 'off' },
  });
  const { result: absences, query: absencesQ } = useList<AbsenceRow>({
    resource: 'absences',
    pagination: { mode: 'off' },
  });
  const { result: members } = useList<MemberRow>({ resource: 'workspace_members', pagination: { mode: 'off' } });
  const { result: users } = useList<UserRow>({ resource: 'users', pagination: { mode: 'off' } });
  const { result: meetingTypes } = useList<MeetingTypeRow>({ resource: 'meeting_types', pagination: { mode: 'off' } });
  const { result: contactAbsences, query: contactAbsencesQ } = useList<ContactAbsenceRow>({
    resource: 'contact_absences',
    pagination: { mode: 'off' },
    sorters: [{ field: 'startsOn', order: 'desc' }],
  });
  const { result: contacts } = useList<ContactRow>({ resource: 'contacts', pagination: { mode: 'off' } });
  const { result: customers } = useList<CustomerRow>({ resource: 'customers', pagination: { mode: 'off' } });

  const contactsByIri = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contacts?.data ?? []) {
      if (c['@id']) map[c['@id']] = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || (c['@id'].split('/').pop() ?? '');
    }
    return map;
  }, [contacts]);
  const customersByIri = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of customers?.data ?? []) if (c['@id']) map[c['@id']] = c.name ?? '';
    return map;
  }, [customers]);

  // Staff who host a bookable Terminart — only THEIR absences remove booking slots.
  const hostIris = useMemo(
    () => new Set((meetingTypes?.data ?? []).map((m) => m.host).filter(Boolean) as string[]),
    [meetingTypes],
  );

  const usersByIri = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of users?.data ?? []) {
      const name = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email || (u['@id'] ?? '');
      if (u['@id']) map[u['@id']] = name;
    }
    return map;
  }, [users]);

  const memberOptions = useMemo(() => {
    const iris = new Set((members?.data ?? []).map((m) => m.user).filter(Boolean) as string[]);
    return [...iris].map((iri) => ({
      iri,
      label: usersByIri[iri] ?? iri.split('/').pop() ?? iri,
      isHost: hostIris.has(iri),
    }));
  }, [members, usersByIri, hostIris]);

  // ---- workspace closure form ----
  const [cName, setCName] = useState('');
  const [cStart, setCStart] = useState(todayISO());
  const [cEnd, setCEnd] = useState(todayISO());
  const [cBusy, setCBusy] = useState(false);

  const addClosure = async () => {
    if (!cName.trim() || !cStart || !cEnd) return;
    if (cEnd < cStart) return toast.error(translate('toast.end_before_start'));
    setCBusy(true);
    try {
      await api.post('/workspace_absences', {
        name: cName.trim(),
        startsOn: atNoon(cStart),
        endsOn: atNoon(cEnd),
        workspace: workspaceIri,
      });
      toast.success(translate('toast.closure_created'));
      setCName('');
      await closuresQ.refetch();
    } catch {
      toast.error(translate('toast.create_failed'));
    } finally {
      setCBusy(false);
    }
  };

  // ---- personal absence form ----
  const [aUser, setAUser] = useState('');
  const [aType, setAType] = useState('vacation');
  const [aStart, setAStart] = useState(todayISO());
  const [aEnd, setAEnd] = useState(todayISO());
  const [aBusy, setABusy] = useState(false);

  const addAbsence = async () => {
    if (!aUser || !aStart || !aEnd) return;
    if (aEnd < aStart) return toast.error(translate('toast.end_before_start'));
    setABusy(true);
    try {
      await api.post('/absences', {
        user: aUser,
        type: aType,
        startsOn: atNoon(aStart),
        endsOn: atNoon(aEnd),
        workspace: workspaceIri,
      });
      toast.success(translate('toast.absence_created'));
      await absencesQ.refetch();
    } catch {
      toast.error(translate('toast.create_failed'));
    } finally {
      setABusy(false);
    }
  };

  const idOf = (r: { '@id': string; id?: string }) => r.id ?? r['@id'].split('/').pop() ?? '';

  const removeClosure = async (r: WorkspaceAbsenceRow) => {
    if (!window.confirm(`„${r.name}" löschen?`)) return;
    try {
      await api.delete(`/workspace_absences/${idOf(r)}`);
      await closuresQ.refetch();
    } catch {
      toast.error(translate('toast.delete_failed'));
    }
  };
  const removeAbsence = async (r: AbsenceRow) => {
    if (!window.confirm('Abwesenheit löschen?')) return;
    try {
      await api.delete(`/absences/${idOf(r)}`);
      await absencesQ.refetch();
    } catch {
      toast.error(translate('toast.delete_failed'));
    }
  };
  const removeContactAbsence = async (r: ContactAbsenceRow) => {
    if (!window.confirm('Abwesenheit löschen?')) return;
    try {
      await api.delete(`/contact_absences/${idOf(r)}`);
      await contactAbsencesQ.refetch();
    } catch {
      toast.error(translate('toast.delete_failed'));
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <CalendarOff className="size-6 text-muted-foreground" /> Abwesenheiten
        </h2>
        <p className="text-sm text-muted-foreground">
          Tage, an denen niemand buchbar ist. Betriebsschließungen gelten für alle, persönliche
          Abwesenheiten nur für die jeweilige Person — beide blenden Buchungs-Slots aus.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Betriebsschließungen</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="grow space-y-1">
              <Label>Bezeichnung</Label>
              <Input placeholder="z. B. Betriebsferien" value={cName} onChange={(e) => setCName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Von</Label>
              <Input type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bis</Label>
              <Input type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} />
            </div>
            <Button type="button" onClick={addClosure} disabled={cBusy || !cName.trim()}>
              {cBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Hinzufügen
            </Button>
          </div>

          {closuresQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : (closures?.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Keine Betriebsschließungen.</p>
          ) : (
            <div className="divide-y">
              {(closures?.data ?? []).map((r) => (
                <div key={idOf(r)} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1 truncate font-medium">{r.name}</div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtRange(r.startsOn, r.endsOn)}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => removeClosure(r)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mitarbeiter-Abwesenheiten</CardTitle>
          <p className="text-sm text-muted-foreground">
            Blendet Buchungs-Slots aus, wenn die Person Gastgeber einer Terminart ist. Mit
            <span className="mx-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">Gastgeber</span>
            markierte Mitglieder wirken sich auf Buchungen aus.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 grow space-y-1">
              <Label>Person</Label>
              <Select value={aUser} onValueChange={setAUser}>
                <SelectTrigger>
                  <SelectValue placeholder="Mitglied wählen" />
                </SelectTrigger>
                <SelectContent>
                  {memberOptions.map((o) => (
                    <SelectItem key={o.iri} value={o.iri}>
                      {o.label}
                      {o.isHost ? ' · Gastgeber' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Art</Label>
              <Select value={aType} onValueChange={setAType}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ABSENCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Von</Label>
              <Input type="date" value={aStart} onChange={(e) => setAStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Bis</Label>
              <Input type="date" value={aEnd} onChange={(e) => setAEnd(e.target.value)} />
            </div>
            <Button type="button" onClick={addAbsence} disabled={aBusy || !aUser}>
              {aBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Hinzufügen
            </Button>
          </div>

          {absencesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : (absences?.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Keine Abwesenheiten.</p>
          ) : (
            <div className="divide-y">
              {(absences?.data ?? []).map((r) => (
                <div key={idOf(r)} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1 truncate font-medium">
                    {usersByIri[r.user] ?? '—'}
                    {hostIris.has(r.user) ? (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-normal text-primary">
                        Gastgeber
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{typeLabel(r.type)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtRange(r.startsOn, r.endsOn)}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => removeAbsence(r)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kunden-Abwesenheiten</CardTitle>
          <p className="text-sm text-muted-foreground">
            Von Kunden im Portal eingetragene Abwesenheiten — rein informativ.
          </p>
        </CardHeader>
        <CardContent>
          {contactAbsencesQ.isLoading ? (
            <p className="text-sm text-muted-foreground">Lädt…</p>
          ) : (contactAbsences?.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Keine Kunden-Abwesenheiten.</p>
          ) : (
            <div className="divide-y">
              {(contactAbsences?.data ?? []).map((r) => (
                <div key={idOf(r)} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">
                      {contactsByIri[r.contact] ?? '—'}
                      <span className="ml-1 text-muted-foreground">· {customersByIri[r.customer] ?? ''}</span>
                    </div>
                    {r.note ? <div className="truncate text-xs text-muted-foreground">{r.note}</div> : null}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtRange(r.startsOn, r.endsOn)}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => removeContactAbsence(r)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
