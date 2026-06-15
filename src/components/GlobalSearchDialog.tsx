import { useList } from '@refinedev/core';
import {
  Building2,
  CheckSquare,
  Contact,
  FileText,
  FolderKanban,
  Search,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
import type { DocumentJsonld } from '@/api/types/document/Jsonld';
import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { TaskJsonld } from '@/api/types/task/Jsonld';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import type { Row } from '@/lib/refine';

/**
 * Cross-resource global search — mounted once in AppLayout next to the
 * QuickAddDialog. Toggle via Cmd+/ (Ctrl+/) so it doesn't clash with
 * Cmd+K (Quick-Add). The split is intentional: Cmd+K = create, Cmd+/ =
 * find.
 *
 * Strategy: typing fires five parallel Refine `useList` calls — one per
 * resource — with the appropriate `contains` filter. Results are paginated
 * to 5 rows each so the dropdown stays under one screen even at "a"-only
 * queries.
 *
 * The five hooks live in a child component (SearchBody) that only mounts
 * once the user actually opens the dialog — otherwise the hook-count
 * would change between renders, which React (rightly) crashes on
 * ("Rules of Hooks").
 */
export function GlobalSearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Suche Tasks, Projekte, Kunden, Kontakte, Dokumente…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {open ? (
          <SearchBody query={query} onPick={() => setOpen(false)} />
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Hint">
          <div className="px-2 py-1.5 text-xs text-muted-foreground inline-flex items-center gap-2">
            <Search className="size-3" />
            Cmd+/ oder Ctrl+/ öffnet die Suche
            <CommandShortcut>Esc schließt</CommandShortcut>
          </div>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function SearchBody({
  query,
  onPick,
}: {
  query: string;
  onPick: () => void;
}) {
  const navigate = useNavigate();
  const enabled = query.trim().length >= 2;

  const { result: tasks } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    pagination: { currentPage: 1, pageSize: 5 },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters: [{ field: 'title', operator: 'contains', value: query }],
    queryOptions: { enabled },
  });
  const { result: projects } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    pagination: { currentPage: 1, pageSize: 5 },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters: [{ field: 'name', operator: 'contains', value: query }],
    queryOptions: { enabled },
  });
  const { result: customers } = useList<Row<CustomerJsonld>>({
    resource: 'customers',
    pagination: { currentPage: 1, pageSize: 5 },
    filters: [{ field: 'name', operator: 'contains', value: query }],
    queryOptions: { enabled },
  });
  const { result: contacts } = useList<Row<ContactJsonld>>({
    resource: 'contacts',
    pagination: { currentPage: 1, pageSize: 5 },
    sorters: [{ field: 'lastName', order: 'asc' }],
    filters: [{ field: 'lastName', operator: 'contains', value: query }],
    queryOptions: { enabled },
  });
  const { result: documents } = useList<Row<DocumentJsonld>>({
    resource: 'documents',
    pagination: { currentPage: 1, pageSize: 5 },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    filters: [{ field: 'name', operator: 'contains', value: query }],
    queryOptions: { enabled },
  });

  const go = (path: string) => {
    onPick();
    navigate(path);
  };

  const tasksRows = tasks?.data ?? [];
  const projectsRows = projects?.data ?? [];
  const customersRows = customers?.data ?? [];
  const contactsRows = contacts?.data ?? [];
  const documentsRows = documents?.data ?? [];
  const totalHits =
    tasksRows.length +
    projectsRows.length +
    customersRows.length +
    contactsRows.length +
    documentsRows.length;

  if (!enabled) {
    return <CommandEmpty>Mindestens 2 Zeichen eingeben.</CommandEmpty>;
  }
  if (totalHits === 0) {
    return <CommandEmpty>Keine Treffer.</CommandEmpty>;
  }

  return (
    <>
      {tasksRows.length > 0 ? (
        <CommandGroup heading="Aufgaben">
          {tasksRows.map((t) => (
            <CommandItem
              key={t['@id']}
              value={`task ${t.identifier} ${t.title}`}
              onSelect={() =>
                t.project
                  ? go(`/projects/${t.project.split('/').pop()}?tab=board`)
                  : go(`/tasks`)
              }
            >
              <CheckSquare className="size-4 text-muted-foreground" />
              <span className="font-mono text-[10px] text-muted-foreground">
                {t.identifier}
              </span>
              <span className="truncate">{t.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}

      {projectsRows.length > 0 ? (
        <>
          {tasksRows.length > 0 ? <CommandSeparator /> : null}
          <CommandGroup heading="Projekte">
            {projectsRows.map((p) => (
              <CommandItem
                key={p['@id']}
                value={`project ${p.key} ${p.name}`}
                onSelect={() => p.id && go(`/projects/${p.id}`)}
              >
                <FolderKanban
                  className="size-4"
                  style={{ color: p.color ?? undefined }}
                />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {p.key}
                </span>
                <span className="truncate">{p.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}

      {customersRows.length > 0 ? (
        <>
          {tasksRows.length + projectsRows.length > 0 ? (
            <CommandSeparator />
          ) : null}
          <CommandGroup heading="Kunden">
            {customersRows.map((c) => (
              <CommandItem
                key={c['@id']}
                value={`customer ${c.name}`}
                onSelect={() => c.id && go(`/customers/${c.id}`)}
              >
                <Building2 className="size-4 text-muted-foreground" />
                <span className="truncate">{c.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}

      {contactsRows.length > 0 ? (
        <>
          {tasksRows.length + projectsRows.length + customersRows.length > 0 ? (
            <CommandSeparator />
          ) : null}
          <CommandGroup heading="Kontakte">
            {contactsRows.map((c) => (
              <CommandItem
                key={c['@id']}
                value={`contact ${c.firstName} ${c.lastName}`}
                onSelect={() => c.id && go(`/contacts/${c.id}`)}
              >
                <Contact className="size-4 text-muted-foreground" />
                <span className="truncate">
                  {c.firstName} {c.lastName}
                </span>
                {c.position ? (
                  <span className="text-xs text-muted-foreground">
                    {c.position}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}

      {documentsRows.length > 0 ? (
        <>
          {tasksRows.length +
            projectsRows.length +
            customersRows.length +
            contactsRows.length >
          0 ? (
            <CommandSeparator />
          ) : null}
          <CommandGroup heading="Dokumente">
            {documentsRows.map((d) => (
              <CommandItem
                key={d['@id']}
                value={`document ${d.name}`}
                onSelect={() => go('/documents')}
              >
                <FileText className="size-4 text-muted-foreground" />
                <span className="truncate">{d.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </>
      ) : null}
    </>
  );
}
