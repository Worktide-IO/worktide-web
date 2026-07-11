import { useInvalidate, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { CheckSquare, Flag, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { api } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type Props = {
  /** Selected task IRIs (or ids — we strip the prefix on submit). */
  selectedIris: string[];
  /** Called after a successful batch op — used to clear the selection. */
  onClear: () => void;
};

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Niedrig' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Hoch' },
  { value: 'urgent', label: 'Dringend' },
];

/**
 * Floating action-bar that slides in when one or more tasks are checked
 * on the /tasks page. Hits the batch endpoint at /v1/tasks/batch:
 *
 *   POST /v1/tasks/batch  { ids, operation, fields }
 *
 * Items the caller can't EDIT are skipped server-side and counted in
 * the response — the toast shows "X bearbeitet, Y übersprungen".
 */
export function BulkActionsBar({ selectedIris, onClear }: Props) {
  const { t } = useTranslation();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Task statuses keyed by IRI — loaded for the "Status setzen" submenu.
  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
    queryOptions: { enabled: selectedIris.length > 0 },
  });

  const ids = selectedIris
    .map((iri) => iri.split('/').pop())
    .filter((id): id is string => Boolean(id));

  const runBatch = async (
    operation: 'set' | 'delete',
    fields: Record<string, unknown> = {},
    label: string,
  ) => {
    setBusy(true);
    try {
      const { data } = await api.post<{
        processed: number;
        skipped: number;
        errors: string[];
      }>('/tasks/batch', { ids, operation, fields });
      const parts: string[] = [`${data.processed} bearbeitet`];
      if (data.skipped > 0) parts.push(`${data.skipped} übersprungen`);
      toast.success(`${label}: ${parts.join(', ')}`);
      await invalidate({ resource: 'tasks', invalidates: ['list', 'many'] });
      onClear();
    } catch (err) {
      console.warn('BulkActionsBar: batch failed', err);
      toast.error(t('toast.action_named_failed', { label }));
    } finally {
      setBusy(false);
    }
  };

  if (selectedIris.length === 0) return null;

  return (
    <>
      <div className="sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-1 rounded-full border bg-background px-3 py-2 shadow-lg">
        <Badge variant="secondary" className="rounded-full">
          {selectedIris.length} ausgewählt
        </Badge>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}>
              <CheckSquare className="size-4" /> Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuLabel>Status setzen</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(statuses?.data ?? []).map((s) => (
              <DropdownMenuItem
                key={s['@id']}
                onClick={() =>
                  void runBatch(
                    'set',
                    { status: s['@id'] ?? '' },
                    `Status → ${s.name}`,
                  )
                }
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: s.color ?? '#94a3b8' }}
                />
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}>
              <Flag className="size-4" /> Prio
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-48">
            <DropdownMenuLabel>Priorität setzen</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PRIORITY_OPTIONS.map((p) => (
              <DropdownMenuItem
                key={p.value}
                onClick={() =>
                  void runBatch('set', { priority: p.value }, `Prio → ${p.label}`)
                }
              >
                {p.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => setDeleteConfirmOpen(true)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="size-4" /> Löschen
        </Button>

        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          size="icon"
          variant="ghost"
          className="size-7 rounded-full"
          onClick={onClear}
          aria-label="Auswahl aufheben"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tasks löschen?</DialogTitle>
            <DialogDescription>
              {selectedIris.length} ausgewählte Tasks werden gelöscht (soft-delete).
              Aufgaben, für die du keine Delete-Rechte hast, werden übersprungen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setDeleteConfirmOpen(false);
                await runBatch('delete', {}, 'Tasks gelöscht');
              }}
            >
              Endgültig löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
