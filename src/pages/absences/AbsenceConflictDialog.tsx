import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { intlLocale } from '@/lib/intl';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type ConflictBooking = {
  id: string;
  inviteeName: string;
  meetingType: string;
  startAt: string;
};
export type ConflictTask = { id: string; title: string; startOn?: string | null };
export type ConflictCustomer = { customerId: string; customerName: string; tasks: ConflictTask[] };
export type AbsenceConflicts = { bookings: ConflictBooking[]; customers: ConflictCustomer[] };

const dtFmt = (v: string) =>
  new Intl.DateTimeFormat(intlLocale(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(
    new Date(v),
  );

/**
 * After a limited-availability absence is recorded, ask the staff which of the
 * appointments (Bookings) and tickets (Tasks) already scheduled in that window
 * they can no longer keep. Confirming cancels the chosen appointments and
 * re-plans around the chosen tickets, drafting a notification for each.
 */
export function AbsenceConflictDialog({
  conflicts,
  userIri,
  onClose,
}: {
  conflicts: AbsenceConflicts | null;
  userIri: string;
  onClose: () => void;
}) {
  const { t: translate } = useTranslation();
  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set());
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasConflicts = !!conflicts && (conflicts.bookings.length > 0 || conflicts.customers.length > 0);
  const nothingSelected = selectedBookings.size === 0 && selectedTasks.size === 0;

  const confirm = async () => {
    if (nothingSelected) return onClose();
    setBusy(true);
    try {
      const { data } = await api.post('/absence-conflicts/resolve', {
        user: userIri,
        bookingIds: [...selectedBookings],
        taskIds: [...selectedTasks],
      });
      const cancelled = Array.isArray(data?.cancelled) ? data.cancelled.length : 0;
      const drafted =
        (Array.isArray(data?.drafted) ? data.drafted.length : 0) +
        (Array.isArray(data?.cancelled) ? data.cancelled.filter((c: { notified?: boolean }) => c.notified).length : 0);
      toast.success(translate('absences.conflicts_resolved', { cancelled, drafted }));
      onClose();
    } catch {
      toast.error(translate('toast.create_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={hasConflicts} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{translate('absences.conflicts_title')}</DialogTitle>
          <DialogDescription>{translate('absences.conflicts_intro')}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {conflicts && conflicts.bookings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{translate('absences.conflicts_appointments')}</h4>
              {conflicts.bookings.map((b) => (
                <label key={b.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <Checkbox checked={selectedBookings.has(b.id)} onCheckedChange={() => toggle(setSelectedBookings, b.id)} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{b.meetingType}</span> · {b.inviteeName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{dtFmt(b.startAt)}</span>
                </label>
              ))}
            </div>
          )}

          {conflicts && conflicts.customers.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{translate('absences.conflicts_tasks')}</h4>
              {conflicts.customers.map((c) => (
                <div key={c.customerId} className="space-y-1">
                  <div className="text-xs text-muted-foreground">{c.customerName}</div>
                  {c.tasks.map((tk) => (
                    <label key={tk.id} className="flex items-center gap-2 rounded border p-2 text-sm">
                      <Checkbox checked={selectedTasks.has(tk.id)} onCheckedChange={() => toggle(setSelectedTasks, tk.id)} />
                      <span className="min-w-0 flex-1 truncate">{tk.title}</span>
                      {tk.startOn ? (
                        <span className="shrink-0 text-xs text-muted-foreground">{dtFmt(tk.startOn)}</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {translate('absences.conflicts_skip')}
          </Button>
          <Button type="button" onClick={confirm} disabled={busy || nothingSelected}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {translate('absences.conflicts_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
