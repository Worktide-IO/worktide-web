import { useList, useUpdate } from '@refinedev/core';
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

const fmt = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

/** Read-only list of upcoming/past bookings with a staff cancel action. */
export function BookingsPage() {
  const { result, query } = useList<BookingRow>({
    resource: 'bookings',
    pagination: { pageSize: 100 },
    sorters: [{ field: 'startAt', order: 'desc' }],
  });
  const { mutate: update, mutation } = useUpdate<BookingRow>();

  const rows = result?.data ?? [];

  function cancel(id: string) {
    if (!window.confirm('Diese Buchung stornieren?')) return;
    update(
      { resource: 'bookings', id, values: { status: 'cancelled' }, successNotification: false },
      {
        onSuccess: () => { toast.success('Storniert.'); void query.refetch(); },
        onError: () => toast.error('Konnte nicht stornieren.'),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-2xl">
          <CalendarDays className="size-6 text-muted-foreground" /> Buchungen
        </h2>
        <p className="text-sm text-muted-foreground">Über die Terminarten gebuchte Termine.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} Buchungen</CardTitle>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Noch keine Buchungen.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Termin</TableHead>
                  <TableHead>Gast</TableHead>
                  <TableHead className="w-24">Status</TableHead>
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
                        {b.status === 'cancelled' ? 'Storniert' : 'Bestätigt'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {b.status !== 'cancelled' && b.id ? (
                        <Button type="button" variant="ghost" size="sm" className="h-7 text-destructive" disabled={mutation.isPending} onClick={() => cancel(b.id!)}>
                          Stornieren
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
