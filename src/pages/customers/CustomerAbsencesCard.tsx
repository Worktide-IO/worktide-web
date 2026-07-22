import { useList } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CalendarOff } from 'lucide-react';
import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Row } from '@/lib/refine';

type ContactAbsenceRow = Row<{ '@id': string; contact: string; startsOn: string; endsOn: string; note?: string | null }>;
type ContactRow = Row<{ '@id': string; firstName?: string; lastName?: string }>;

const dateFmt = { format: (v: Date | number) => new Intl.DateTimeFormat(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(v) };
const fmtRange = (a: string, b: string) =>
  a.slice(0, 10) === b.slice(0, 10)
    ? dateFmt.format(new Date(a))
    : `${dateFmt.format(new Date(a))} – ${dateFmt.format(new Date(b))}`;

/**
 * A customer's contacts' portal-set absences (informational). Read-only here —
 * clients manage them in their portal.
 */
export function CustomerAbsencesCard({ customerIri }: { customerIri: string }) {
  const { t } = useTranslation();
  const { result: absences, query: absencesQuery } = useList<ContactAbsenceRow>({
    resource: 'contact_absences',
    filters: [{ field: 'customer', operator: 'eq', value: customerIri }],
    sorters: [{ field: 'startsOn', order: 'desc' }],
    pagination: { mode: 'off' },
  });
  const { result: contacts, query: contactsQuery } = useList<ContactRow>({
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
  const loading = absencesQuery.isLoading || contactsQuery.isLoading;
  const error = absencesQuery.isError || contactsQuery.isError;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="size-4 text-muted-foreground" /> {t('contact_absences.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3 py-1">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-36" />
          </div>
        ) : error ? (
          <p className="flex items-center gap-1.5 py-2 text-sm text-destructive">
            <AlertCircle className="size-3.5" /> {t('contact_absences.error')}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            {t('absences.no_customer_absences')}
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
