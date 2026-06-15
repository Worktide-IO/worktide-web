import { useCreate, useDelete, useGetIdentity, useList } from '@refinedev/core';
import { type CrudFilter } from '@refinedev/core';
import { Bookmark, BookmarkPlus, Check, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { TaskViewJsonld } from '@/api/types/taskView/Jsonld';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { Row } from '@/lib/refine';

type Identity = { id?: string };

type Props = {
  /** Current filter set from useTable — used to "Save current" + match the active view. */
  currentFilters: CrudFilter[];
  /** Called when a saved view is picked: apply the stored filter shape. */
  onApply: (filters: CrudFilter[]) => void;
  /** Called when a view is freshly stored — lets the parent toast etc. */
  onSaved?: (view: Row<TaskViewJsonld>) => void;
};

/**
 * Right-aligned dropdown + save-dialog for TaskView (saved queries).
 *
 * Despite the entity being called TaskView the schema is generic enough
 * to hold any filter set; for now this is wired only on /tasks. Other
 * list pages can adopt it once a generic "SavedView" entity (or
 * `resource` column on TaskView) lands.
 *
 * Encoding: API Platform's filter URL params are flat strings, so we
 * persist `{ field: value }` and re-hydrate as `{ field, operator: 'eq',
 * value }`. We lose the operator on the round-trip, but every list page
 * uses the same operator per field anyway (exact/contains is fixed in
 * the ApiFilter declaration on the entity), so the API result is the
 * same shape either way.
 */
export function SavedViewsBar({ currentFilters, onApply, onSaved }: Props) {
  const { data: identity } = useGetIdentity<Identity>();
  const userIri = identity?.id ? `/v1/users/${identity.id}` : null;

  const { result, query } = useList<Row<TaskViewJsonld>>({
    resource: 'task_views',
    pagination: { mode: 'off' },
    filters: userIri
      ? [{ field: 'owner', operator: 'eq', value: userIri }]
      : [],
    queryOptions: { enabled: Boolean(userIri) },
  });

  const { mutate: createView, mutation: createMut } = useCreate<Row<TaskViewJsonld>>();
  const { mutate: deleteView } = useDelete();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);

  const flat = filtersToFlat(currentFilters);
  const active = (result?.data ?? []).find((v) => sameFilter(v.filter, flat));

  const handleSave = () => {
    if (!name.trim() || !userIri) return;
    // TaskView requires explicit owner + workspace on POST — the backend
    // doesn't auto-hydrate those from the JWT/X-Workspace-Id header
    // (unlike the Customer/Contact resources which take ProjectMember
    // bootstrapping). Always include them.
    const workspaceId = typeof window !== 'undefined'
      ? localStorage.getItem(WORKSPACE_STORAGE_KEY)
      : null;
    createView(
      {
        resource: 'task_views',
        values: {
          name: name.trim(),
          filter: flat,
          sortOrder: [],
          isShared: shared,
          owner: userIri,
          workspace: workspaceId ? `/v1/workspaces/${workspaceId}` : undefined,
        },
        successNotification: false,
      },
      {
        onSuccess: ({ data }) => {
          toast.success('Filter gespeichert.');
          setDialogOpen(false);
          setName('');
          setShared(false);
          onSaved?.(data as Row<TaskViewJsonld>);
        },
        onError: () => toast.error('Konnte nicht speichern.'),
      },
    );
  };

  const handleDelete = (view: Row<TaskViewJsonld>) => {
    if (!view.id) return;
    deleteView(
      { resource: 'task_views', id: view.id, successNotification: false },
      {
        onSuccess: () => toast.success(`"${view.name}" gelöscht.`),
        onError: () => toast.error('Konnte nicht löschen.'),
      },
    );
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={active ? 'secondary' : 'outline'}
            size="sm"
            className="gap-1.5"
            disabled={query.isLoading}
          >
            <Bookmark className={active ? 'size-3.5 fill-current' : 'size-3.5'} />
            {active ? active.name : 'Gespeicherte Filter'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Meine Filter</DropdownMenuLabel>
          {(result?.data ?? []).length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">
              Keine gespeicherten Filter.
            </div>
          ) : (
            (result?.data ?? []).map((v) => {
              const isActive = active?.id === v.id;
              return (
                <DropdownMenuItem
                  key={v['@id']}
                  className="flex items-center justify-between gap-2"
                  onSelect={() => onApply(flatToFilters(v.filter ?? {}))}
                >
                  <span className="flex items-center gap-1.5">
                    {isActive ? (
                      <Check className="size-3.5 text-primary" />
                    ) : (
                      <span className="size-3.5" />
                    )}
                    <span className="truncate">{v.name}</span>
                    {v.isShared ? (
                      <span className="text-[10px] text-muted-foreground">geteilt</span>
                    ) : null}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(v);
                    }}
                    aria-label="Löschen"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </DropdownMenuItem>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setDialogOpen(true);
            }}
          >
            <BookmarkPlus className="size-4" /> Aktuellen Filter speichern…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Filter speichern</DialogTitle>
            <DialogDescription>
              Filtersatz wird unter diesem Namen gespeichert und kann jederzeit
              wieder angewendet werden.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                placeholder="z. B. Meine offenen — Hohe Prio"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="view-shared">Mit Workspace teilen</Label>
                <p className="text-xs text-muted-foreground">
                  Andere Mitglieder sehen den Filter dann auch.
                </p>
              </div>
              <Switch id="view-shared" checked={shared} onCheckedChange={setShared} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim() || createMut.isPending}
            >
              {createMut.isPending ? 'Speichere …' : 'Speichern'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function filtersToFlat(filters: CrudFilter[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of filters) {
    if ('field' in f && f.field && f.value !== undefined && f.value !== null && f.value !== '') {
      map[f.field] = String(f.value);
    }
  }
  return map;
}

function flatToFilters(map: Record<string, string | null>): CrudFilter[] {
  const out: CrudFilter[] = [];
  for (const [field, value] of Object.entries(map ?? {})) {
    if (value == null || value === '') continue;
    // Operator picks itself up from the field's ApiFilter on the backend;
    // 'eq' is the safe default — string-partial fields will treat it as
    // contains since that's how their SearchFilter is declared.
    out.push({ field, operator: 'eq', value });
  }
  return out;
}

function sameFilter(
  a: Record<string, string | null> | undefined | null,
  b: Record<string, string>,
): boolean {
  const ae = Object.entries(a ?? {}).filter(([, v]) => v != null && v !== '');
  const be = Object.entries(b).filter(([, v]) => v != null && v !== '');
  if (ae.length !== be.length) return false;
  const ma = Object.fromEntries(ae);
  for (const [k, v] of be) {
    if (ma[k] !== v) return false;
  }
  return true;
}
