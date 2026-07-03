import { useUpdate } from '@refinedev/core';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import type { BoardColumnConfig } from '@/lib/boardColumns';
import type { Row } from '@/lib/refine';
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
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Configure the board's columns: group one or more workspace TaskStatuses into
 * named columns and pick each group's "primary" status (the one a card gets when
 * dropped there). Persisted to `Workspace.settings.boardColumns` via PATCH.
 * A status may live in at most one group; anything left ungrouped renders as its
 * own column on the board.
 */
export function BoardConfigDialog({
  open,
  onOpenChange,
  workspaceId,
  settings,
  columns,
  statuses,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  settings: Record<string, unknown> | null | undefined;
  columns: BoardColumnConfig[] | null;
  statuses: Row<TaskStatusJsonld>[];
}) {
  // Seeded once per mount from the saved config. The parent mounts this dialog
  // only while open, so a fresh open always re-reads the current config.
  const [groups, setGroups] = useState<BoardColumnConfig[]>(() =>
    (columns ?? []).map((c) => ({ ...c, statusIds: [...c.statusIds] })),
  );
  const { mutate: update, mutation } = useUpdate();

  const statusName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of statuses) if (s['@id']) m[s['@id']] = s.name ?? '';
    return m;
  }, [statuses]);

  const assignedElsewhere = (iri: string, groupId: string) =>
    groups.some((g) => g.id !== groupId && g.statusIds.includes(iri));

  const ungrouped = statuses.filter(
    (s) => s['@id'] && !groups.some((g) => g.statusIds.includes(s['@id'] as string)),
  );

  const addGroup = () =>
    setGroups((gs) => [
      ...gs,
      { id: crypto.randomUUID(), name: 'Neue Spalte', color: '#94a3b8', statusIds: [], primaryStatusId: '' },
    ]);

  const patch = (id: string, next: Partial<BoardColumnConfig>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...next } : g)));

  const remove = (id: string) => setGroups((gs) => gs.filter((g) => g.id !== id));

  const move = (id: string, dir: -1 | 1) =>
    setGroups((gs) => {
      const i = gs.findIndex((g) => g.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= gs.length) return gs;
      const copy = [...gs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const toggleStatus = (groupId: string, iri: string) =>
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== groupId) {
          // Enforce single-membership: drop it from any other group.
          return g.statusIds.includes(iri)
            ? { ...g, statusIds: g.statusIds.filter((x) => x !== iri), primaryStatusId: g.primaryStatusId === iri ? '' : g.primaryStatusId }
            : g;
        }
        const has = g.statusIds.includes(iri);
        const statusIds = has ? g.statusIds.filter((x) => x !== iri) : [...g.statusIds, iri];
        let primaryStatusId = g.primaryStatusId;
        if (has && primaryStatusId === iri) primaryStatusId = statusIds[0] ?? '';
        if (!has && primaryStatusId === '') primaryStatusId = iri;
        return { ...g, statusIds, primaryStatusId };
      }),
    );

  const save = () => {
    // Keep only non-empty groups; renumber positions by display order.
    const boardColumns = groups
      .filter((g) => g.statusIds.length > 0 && g.name.trim() !== '')
      .map((g, i) => ({
        ...g,
        name: g.name.trim(),
        position: i,
        primaryStatusId: g.statusIds.includes(g.primaryStatusId) ? g.primaryStatusId : g.statusIds[0],
      }));

    const prev = settings ?? {};
    update(
      {
        resource: 'workspaces',
        id: workspaceId,
        values: { settings: { ...prev, boardColumns } },
        successNotification: false,
      },
      {
        onSuccess: () => {
          toast.success('Board-Spalten gespeichert.');
          onOpenChange(false);
        },
        onError: () => toast.error('Speichern fehlgeschlagen.'),
      },
    );
  };

  const resetToPerStatus = () => setGroups([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Board-Spalten konfigurieren</DialogTitle>
          <DialogDescription>
            Fasse Status zu Spalten zusammen. Beim Ziehen einer Karte in eine Spalte bekommt sie
            deren „primären" Status. Nicht zugeordnete Status erscheinen als eigene Spalten.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
          {groups.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
              Keine Gruppen — das Board zeigt eine Spalte pro Status. Füge eine Gruppe hinzu, um
              Status zusammenzufassen.
            </p>
          ) : null}

          {groups.map((g, i) => (
            <div key={g.id} className="rounded-md border p-3 space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => move(g.id, -1)}
                    disabled={i === 0}
                    aria-label="Nach oben"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => move(g.id, 1)}
                    disabled={i === groups.length - 1}
                    aria-label="Nach unten"
                  >
                    ▼
                  </button>
                </div>
                <GripVertical className="size-4 text-muted-foreground" />
                <input
                  type="color"
                  value={g.color ?? '#94a3b8'}
                  onChange={(e) => patch(g.id, { color: e.target.value })}
                  className="size-8 shrink-0 cursor-pointer rounded border bg-transparent"
                  aria-label="Farbe"
                />
                <Input
                  value={g.name}
                  onChange={(e) => patch(g.id, { name: e.target.value })}
                  placeholder="Spaltenname"
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => remove(g.id)} aria-label="Gruppe löschen">
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {statuses.map((s) => {
                  const iri = s['@id'] as string;
                  if (!iri) return null;
                  const checked = g.statusIds.includes(iri);
                  const elsewhere = assignedElsewhere(iri, g.id);
                  return (
                    <label
                      key={iri}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${elsewhere && !checked ? 'opacity-40' : ''}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleStatus(g.id, iri)} />
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: s.color ?? '#94a3b8' }}
                      />
                      {s.name}
                    </label>
                  );
                })}
              </div>

              {g.statusIds.length > 0 ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Primärer Status (Drop-Ziel):</span>
                  <Select value={g.primaryStatusId} onValueChange={(v) => patch(g.id, { primaryStatusId: v })}>
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue placeholder="wählen…" />
                    </SelectTrigger>
                    <SelectContent>
                      {g.statusIds.map((iri) => (
                        <SelectItem key={iri} value={iri}>
                          {statusName[iri] ?? iri}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          ))}

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" onClick={addGroup}>
              <Plus className="size-4" /> Gruppe hinzufügen
            </Button>
            {ungrouped.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                {ungrouped.length} Status ohne Gruppe (eigene Spalte): {ungrouped.map((s) => s.name).join(', ')}
              </span>
            ) : null}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="ghost" size="sm" onClick={resetToPerStatus}>
            Auf „Spalte pro Status" zurücksetzen
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="button" onClick={save} disabled={mutation.isPending}>
              Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
