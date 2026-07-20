import { useList } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CalendarOff } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Row } from '@/lib/refine';

type ContactAbsenceRow = Row<{ '@id': string; startsOn: string; endsOn: string; note?: string | null }>;

const dateFmt = { format: (v: Date | number) => new Intl.DateTimeFormat(intlLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }).format(v) };
const fmtRange = (a: string, b: string) =>
  a.slice(0, 10) === b.slice(0, 10)
    ? dateFmt.format(new Date(a))
    : `${dateFmt.format(new Date(a))} – ${dateFmt.format(new Date(b))}`;

/**
 * A contact's own portal-set absences (read-only; the contact manages them in
 * their portal).
 */
export function ContactAbsencesCard({ contactId }: { contactId: string }) {
  const { t } = useTranslation();
  const { result, query } = useList<ContactAbsenceRow>({
    resource: 'contact_absences',
    filters: [{ field: 'contact', operator: 'eq', value: `/v1/contacts/${contactId}` }],
    sorters: [{ field: 'startsOn', order: 'desc' }],
    pagination: { mode: 'off' },
  });
  const rows = result?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="size-4 text-muted-foreground" /> {t('contact_absences.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-3 py-1">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : query.isError ? (
          <p className="flex items-center gap-1.5 py-2 text-sm text-destructive">
            <AlertCircle className="size-3.5" /> {t('contact_absences.error')}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">{t('contact_absences.empty')}</p>
        ) : (
          <div className="divide-y">
            {rows.map((r) => (
              <div key={r['@id']} className="flex items-center gap-2 py-2 text-sm">
                <span className="flex-1 font-medium">{fmtRange(r.startsOn, r.endsOn)}</span>
                {r.note ? <span className="truncate text-xs text-muted-foreground">{r.note}</span> : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
