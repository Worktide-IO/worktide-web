import { useList } from '@refinedev/core';
import { CalendarOff } from 'lucide-react';
import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Row } from '@/lib/refine';

type ContactAbsenceRow = Row<{ '@id': string; contact: string; startsOn: string; endsOn: string; note?: string | null }>;
type ContactRow = Row<{ '@id': string; firstName?: string; lastName?: string }>;

const dateFmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtRange = (a: string, b: string) =>
  a.slice(0, 10) === b.slice(0, 10)
    ? dateFmt.format(new Date(a))
    : `${dateFmt.format(new Date(a))} – ${dateFmt.format(new Date(b))}`;

/**
 * A customer's contacts' portal-set absences (informational). Read-only here —
 * clients manage them in their portal.
 */
export function CustomerAbsencesCard({ customerIri }: { customerIri: string }) {
  const { result: absences } = useList<ContactAbsenceRow>({
    resource: 'contact_absences',
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    sorters: [{ field: 'startsOn', order: 'desc' }],
    pagination: { mode: 'off' },
  });
  const { result: contacts } = useList<ContactRow>({
    resource: 'contacts',
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    pagination: { mode: 'off' },
  });

  const contactsByIri = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of contacts?.data ?? []) {
      if (c['@id']) map[c['@id']] = `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim();
    }
    return map;
  }, [contacts]);

  const rows = absences?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="size-4 text-muted-foreground" /> Abwesenheiten
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Keine vom Kunden eingetragenen Abwesenheiten.
          </p>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r['@id']} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{contactsByIri[r.contact] ?? '—'}</div>
                  {r.note ? <div className="truncate text-xs text-muted-foreground">{r.note}</div> : null}
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{fmtRange(r.startsOn, r.endsOn)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
