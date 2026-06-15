import { useCreate, useGetIdentity, useList } from '@refinedev/core';
import { useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Loader2, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Row } from '@/lib/refine';

type Identity = { id?: string };

/**
 * Cmd+K (Ctrl+K) opens a small dialog for one-line task creation.
 * Title is required; project + status default sensibly when omitted:
 *   - status: the TaskStatus flagged isDefault=true, else lowest-position
 *   - project: optional ("Privat" when blank)
 *   - identifier: auto-minted from the project key + 4 random hex chars
 *
 * Submits via Refine's useCreate so the on-success cache invalidation
 * picks up automatically. Enter submits, Esc closes. Reset on close so
 * the dialog stays "fresh" next time.
 */
export function QuickAddDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [statusId, setStatusId] = useState<string>('');
  const titleRef = useRef<HTMLInputElement | null>(null);

  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: identity } = useGetIdentity<Identity>();

  // Global keyboard shortcut — Cmd+K on macOS, Ctrl+K elsewhere.
  // Mounted once via AppLayout; safe even if no dialog is rendered.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { result: statuses } = useList<Row<TaskStatusJsonld>>({
    resource: 'task_statuses',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
    queryOptions: { enabled: open },
  });
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { mode: 'off' },
    filters: [{ field: 'isArchived', operator: 'eq', value: 'false' }],
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    queryOptions: { enabled: open },
  });

  // Pick the workspace default status the first time we have the list.
  useEffect(() => {
    if (statusId) return;
    const rows = statuses?.data ?? [];
    if (rows.length === 0) return;
    const def = rows.find((s) => (s as { default?: boolean }).default ?? s.isDefault) ?? rows[0];
    if (def['@id']) setStatusId(def['@id']);
  }, [statuses, statusId]);

  // Focus the title input when dialog opens.
  useEffect(() => {
    if (open) {
      // setTimeout to wait for the Dialog's portal mount + autofocus race.
      const t = setTimeout(() => titleRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setTitle('');
    setProjectId('none');
  }, [open]);

  const { mutate: createTask, mutation } = useCreate<Row<TaskJsonld>>();
  const submitting = mutation.isPending;

  const project = projects?.data?.find((p) => p['@id'] === projectId) ?? null;

  const handleSubmit = () => {
    const trimmed = title.trim();
    if (!trimmed || !statusId) return;
    const key = project?.key ?? 'TASK';
    const hex = Math.floor(0x1000 + Math.random() * 0xefff).toString(16);
    const workspaceId =
      typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    createTask(
      {
        resource: 'tasks',
        values: {
          title: trimmed,
          identifier: `${key}-${hex}`,
          status: statusId,
          project: projectId === 'none' ? null : projectId,
          workspace: workspaceId ? `/v1/workspaces/${workspaceId}` : undefined,
          createdBy: identity?.id ? `/v1/users/${identity.id}` : undefined,
        },
        successNotification: false,
      },
      {
        onSuccess: ({ data }) => {
          toast.success(`${data.identifier} angelegt`);
          // Force a refresh of the tasks list and the current project
          // detail (Board reflows from a useList of tasks).
          void qc.invalidateQueries({ queryKey: ['tasks'] });
          setOpen(false);
        },
        onError: (err) => {
          console.warn('QuickAdd: create failed', err);
          toast.error('Konnte Task nicht anlegen.');
        },
      },
    );
  };

  return (
    <>
      {/* Floating "+" button bottom-right alongside the FloatingTimer.
          Tiny, on top of the timer pill — same z-layer. */}
      <Button
        type="button"
        size="icon"
        variant="outline"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-50 size-9 rounded-full shadow-md"
        aria-label="Schnell hinzufügen"
        title="Cmd+K"
      >
        <Plus className="size-4" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sm:max-w-lg"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !submitting) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4" /> Schnell-Erfassung
            </DialogTitle>
            <DialogDescription>
              Eine neue Aufgabe in Sekunden anlegen. Enter speichert,
              Esc schließt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-add-title">Titel</Label>
              <Input
                ref={titleRef}
                id="quick-add-title"
                placeholder="Was soll erledigt werden?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Projekt (optional)</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="inline-flex items-center gap-2">
                      <FolderKanban className="size-3.5 text-muted-foreground" />
                      — Privat —
                    </span>
                  </SelectItem>
                  {(projects?.data ?? []).map((p) => (
                    <SelectItem key={p['@id']} value={p['@id'] ?? ''}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 rounded-full"
                          style={{ backgroundColor: p.color ?? '#6366f1' }}
                        />
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {p.key}
                        </span>
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                if (project?.id) {
                  setOpen(false);
                  navigate(`/projects/${project.id}?tab=board`);
                } else {
                  setOpen(false);
                  navigate('/tasks');
                }
              }}
            >
              Zur Liste
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !title.trim() || !statusId}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Speichere…
                </>
              ) : (
                <>Anlegen ⏎</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
