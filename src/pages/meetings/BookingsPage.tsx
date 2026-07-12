import { useList, useUpdate } from '@refinedev/core';
import { intlLocale } from '@/lib/intl';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Video } from 'lucide-react';
import { toast } from 'sonner';

import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type BookingRow = Row<{
  '@id': string;
  id?: string;
  startAt: string;
  endAt: string;
  inviteeName: string;
  inviteeEmail: string;
  status: string;
  notes?: string | null;
}>;

const fmt = { format: (v: Date | number) => new Intl.DateTimeFormat(intlLocale(), {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(v) };

/** Read-only list of upcoming/past bookings with a staff cancel action. */
export function BookingsPage() {
  const { t } = useTranslation();
  const { result, query } = useList<BookingRow>({
    resource: 'bookings',
    pagination: { pageSize: 100 },
    sorters: [{ field: 'startAt', order: 'desc' }],
  });
  const { mutate: update, mutation } = useUpdate<BookingRow>();

  const rows = result?.data ?? [];

  function cancel(id: string) {
    if (!window.confirm(t('bookings_page.confirm_cancel'))) return;
    update(
      { resource: 'bookings', id, values: { status: 'cancelled' }, successNotification: false },
      {
        onSuccess: () => { toast.success(t('toast.cancelled')); void query.refetch(); },
        onError: () => toast.error(t('toast.could_not_cancel')),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <CalendarDays className="size-6 text-muted-foreground" /> {t('bookings_page.heading')}
        </h2>
        <p className="text-sm text-muted-foreground">{t('bookings_page.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('bookings_page.count', { count: rows.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('bookings_page.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('bookings_page.col_appointment')}</TableHead>
                  <TableHead>{t('bookings_page.col_guest')}</TableHead>
                  <TableHead className="w-24">{t('bookings_page.col_status')}</TableHead>
                  <TableHead className="w-28 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((b) => (
                  <TableRow key={b['@id']} className={b.status === 'cancelled' ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-1.5"><Video className="size-3.5 text-muted-foreground" /> {fmt.format(new Date(b.startAt))}</span>
                    </TableCell>
                    <TableCell>
                      <div>{b.inviteeName}</div>
                      <div className="text-xs text-muted-foreground">{b.inviteeEmail}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={b.status === 'cancelled' ? 'outline' : 'secondary'} className="text-[10px]">
                        {b.status === 'cancelled' ? t('bookings_page.status_cancelled') : t('bookings_page.status_confirmed')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {b.status !== 'cancelled' && b.id ? (
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" disabled={mutation.isPending} onClick={() => cancel(b.id!)}>
                          {t('bookings_page.cancel')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
