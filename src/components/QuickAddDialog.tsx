import { useCreate, useGetIdentity, useList } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import {
  CheckSquare,
  FolderKanban,
  Loader2,
  Plus,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { ProjectStatusJsonld } from '@/api/types/projectStatus/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import type { TaskStatusJsonld } from '@/api/types/taskStatus/Jsonld';
import { CustomerCombobox } from '@/components/CustomerCombobox';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Row } from '@/lib/refine';

type Identity = { id?: string };
type Mode = 'task' | 'project';

/**
 * Cmd+K / Ctrl+K opens a small create dialog for either a new task
 * (default) or a new project. A two-state Tabs control at the top
 * picks the mode — picking it preserves the title input so a user
 * who started typing "Migration" doesn't lose it on the switch.
 *
 * For the deep multi-field create flow there's still the dedicated
 * `/projects/create` page (linked via the "Mehr Felder…" button at the
 * bottom). The dialog covers the 80%-case: Name + Key + Status +
 * optional Customer.
 *
 * Submit semantics:
 *   - task: title + status required, project + assignee optional.
 *   - project: name + key + status required, customer optional. Number
 *     is left blank deliberately so the workspace pattern (if any) can
 *     auto-fill it on the backend.
 */
export function QuickAddDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('task');
  const [title, setTitle] = useState('');
  const [projectId, setProjectId] = useState<string>('none');
  const [taskStatusId, setTaskStatusId] = useState<string>('');

  // project mode
  const [projectKey, setProjectKey] = useState('');
  const [projectKeyTouched, setProjectKeyTouched] = useState(false);
  const [projectStatusId, setProjectStatusId] = useState<string>('');
  const [projectCustomer, setProjectCustomer] = useState<string>('none');

  const titleRef = useRef<HTMLInputElement | null>(null);

  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: identity } = useGetIdentity<Identity>();

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

  const { result: taskStatuses } = useList<Row<TaskStatusJsonld>>({
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
  const { result: projectStatuses } = useList<Row<ProjectStatusJsonld>>({
    resource: 'project_statuses',
    pagination: { mode: 'off' },
    queryOptions: { enabled: open && mode === 'project' },
  });

  // Defaults for the picked-first-time selects.
  useEffect(() => {
    if (taskStatusId) return;
    const rows = taskStatuses?.data ?? [];
    if (rows.length === 0) return;
    const def = rows.find((s) => (s as { default?: boolean }).default ?? s.isDefault) ?? rows[0];
    if (def['@id']) setTaskStatusId(def['@id']);
  }, [taskStatuses, taskStatusId]);

  useEffect(() => {
    if (projectStatusId) return;
    const rows = projectStatuses?.data ?? [];
    if (rows.length === 0) return;
    if (rows[0]['@id']) setProjectStatusId(rows[0]['@id']);
  }, [projectStatuses, projectStatusId]);

  // Focus + reset on open/close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => titleRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    setTitle('');
    setProjectId('none');
    setProjectKey('');
    setProjectKeyTouched(false);
    setProjectCustomer('none');
  }, [open]);

  // Auto-derive project key from name until the user edits it manually.
  useEffect(() => {
    if (mode !== 'project' || projectKeyTouched) return;
    const derived = title
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.slice(0, 4))
      .join('')
      .slice(0, 8);
    setProjectKey(derived);
  }, [title, mode, projectKeyTouched]);

  const { mutate: createTask, mutation: taskMutation } = useCreate<Row<TaskJsonld>>();
  const { mutate: createProject, mutation: projectMutation } = useCreate<Row<ProjectJsonld>>();
  const submitting = taskMutation.isPending || projectMutation.isPending;

  const taskProject = projects?.data?.find((p) => p['@id'] === projectId) ?? null;

  const workspaceIri = (() => {
    const id = typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    return id ? `/v1/workspaces/${id}` : undefined;
  })();

  const submitTask = () => {
    const trimmed = title.trim();
    if (!trimmed || !taskStatusId) return;
    const key = taskProject?.key ?? 'TASK';
    const hex = Math.floor(0x1000 + Math.random() * 0xefff).toString(16);
    createTask(
      {
        resource: 'tasks',
        values: {
          title: trimmed,
          identifier: `${key}-${hex}`,
          status: taskStatusId,
          project: projectId === 'none' ? null : projectId,
          workspace: workspaceIri,
          createdBy: identity?.id ? `/v1/users/${identity.id}` : undefined,
        },
        successNotification: false,
      },
      {
        onSuccess: ({ data }) => {
          toast.success(`${data.identifier} angelegt`);
          void qc.invalidateQueries({ queryKey: ['tasks'] });
          setOpen(false);
        },
        onError: () => toast.error(t('toast.could_not_create_task')),
      },
    );
  };

  const submitProject = () => {
    const trimmedName = title.trim();
    const trimmedKey = projectKey.trim().toUpperCase();
    if (!trimmedName || !trimmedKey || !projectStatusId) return;
    createProject(
      {
        resource: 'projects',
        values: {
          name: trimmedName,
          key: trimmedKey,
          status: projectStatusId,
          customer: projectCustomer === 'none' ? null : projectCustomer,
          workspace: workspaceIri,
        },
        successNotification: false,
      },
      {
        onSuccess: ({ data }) => {
          toast.success(`Projekt ${data.key ?? trimmedKey} angelegt`);
          void qc.invalidateQueries({ queryKey: ['projects'] });
          setOpen(false);
          if (data.id) navigate(`/projects/${data.id}`);
        },
        onError: () => toast.error(t('toast.could_not_create_project')),
      },
    );
  };

  const canSubmit =
    mode === 'task'
      ? Boolean(title.trim() && taskStatusId)
      : Boolean(title.trim() && projectKey.trim() && projectStatusId);

  return (
    <>
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
            if (e.key === 'Enter' && !e.shiftKey && !submitting && canSubmit) {
              e.preventDefault();
              if (mode === 'task') submitTask();
              else submitProject();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4" /> Schnell-Erfassung
            </DialogTitle>
            <DialogDescription>
              Enter speichert, Esc schließt.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="w-full">
              <TabsTrigger value="task" className="flex-1 gap-1.5">
                <CheckSquare className="size-3.5" /> Aufgabe
              </TabsTrigger>
              <TabsTrigger value="project" className="flex-1 gap-1.5">
                <FolderKanban className="size-3.5" /> Projekt
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-add-title">
                {mode === 'task' ? 'Titel' : 'Projektname'}
              </Label>
              <Input
                ref={titleRef}
                id="quick-add-title"
                placeholder={
                  mode === 'task'
                    ? 'Was soll erledigt werden?'
                    : 'Wie heißt das Projekt?'
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {mode === 'task' ? (
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
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="quick-add-key">
                    Key (Slug für Task-IDs)
                  </Label>
                  <Input
                    id="quick-add-key"
                    value={projectKey}
                    onChange={(e) => {
                      setProjectKeyTouched(true);
                      setProjectKey(e.target.value.toUpperCase());
                    }}
                    placeholder="z. B. WORK"
                    maxLength={16}
                    className="font-mono uppercase"
                  />
                  <p className="text-xs text-muted-foreground">
                    Wird aus dem Namen vorgeschlagen; eindeutig pro Workspace.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label>Kunde (optional)</Label>
                  <CustomerCombobox
                    value={projectCustomer === 'none' ? null : projectCustomer}
                    onChange={(v) => setProjectCustomer(v ?? 'none')}
                  />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            {mode === 'project' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false);
                  navigate('/projects/create');
                }}
              >
                Mehr Felder…
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (taskProject?.id) {
                    setOpen(false);
                    navigate(`/projects/${taskProject.id}?tab=board`);
                  } else {
                    setOpen(false);
                    navigate('/tasks');
                  }
                }}
              >
                Zur Liste
              </Button>
            )}
            <Button
              type="button"
              onClick={mode === 'task' ? submitTask : submitProject}
              disabled={submitting || !canSubmit}
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
