import {
  Building2,
  CheckSquare,
  Contact,
  FileText,
  FolderKanban,
  Inbox,
  Loader2,
  Mail,
  Search,
  Send,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

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
import { api } from '@/lib/api';

/**
 * Cross-entity global search — mounted once in AppLayout next to QuickAddDialog.
 * Toggle via Cmd+/ (Ctrl+/); Cmd+K stays Quick-Add. Cmd+/ = find.
 *
 * Backed by the server's ranked /v1/search (SEARCH_PROVIDER=mysql|meilisearch):
 * one debounced call returns hits across mail, tasks, CRM, projects and
 * documents. cmdk's client-side filtering is disabled (shouldFilter=false) — the
 * server already ranked + filtered, so we render its order verbatim.
 */

type SearchHit = {
  type: string;
  id: string;
  iri: string;
  title: string;
  snippet: string;
  updatedAt: number | null;
  parentType: string | null;
  parentId: string | null;
};

// Only types with a sensible destination are requested (comment has none).
const TYPES = 'task,project,conversation,inbound_event,outbound_message,customer,contact,document';

const GROUPS: { type: string; label: string; icon: typeof CheckSquare }[] = [
  { type: 'task', label: 'search.group_tasks', icon: CheckSquare },
  { type: 'project', label: 'search.group_projects', icon: FolderKanban },
  { type: 'conversation', label: 'search.group_conversations', icon: Inbox },
  { type: 'inbound_event', label: 'search.group_mail_in', icon: Mail },
  { type: 'outbound_message', label: 'search.group_mail_out', icon: Send },
  { type: 'customer', label: 'search.group_customers', icon: Building2 },
  { type: 'contact', label: 'search.group_contacts', icon: Contact },
  { type: 'document', label: 'search.group_documents', icon: FileText },
];

const stripHighlight = (s: string): string => s.replace(/<\/?em>/g, '');

function routeFor(hit: SearchHit): string | null {
  switch (hit.type) {
    case 'project':
      return `/projects/${hit.id}`;
    case 'conversation':
      return `/inbox/${hit.id}`;
    case 'inbound_event':
    case 'outbound_message':
      return hit.parentId ? `/inbox/${hit.parentId}` : null;
    case 'customer':
      return `/customers/${hit.id}`;
    case 'contact':
      return `/contacts/${hit.id}`;
    case 'task':
      return '/tasks';
    case 'document':
      return '/documents';
    default:
      return null;
  }
}

export function GlobalSearchDialog() {
  const { t } = useTranslation();
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

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setQuery('');
  };

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} shouldFilter={false}>
      <CommandInput
        placeholder={t('search.placeholder')}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {open ? <SearchBody query={query} onPick={() => setOpen(false)} /> : null}
        <CommandSeparator />
        <CommandGroup heading="Hint">
          <div className="px-2 py-1.5 text-xs text-muted-foreground inline-flex items-center gap-2">
            <Search className="size-3" />
            {t('search.hint')}
            <CommandShortcut>{t('search.esc_closes')}</CommandShortcut>
          </div>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

function SearchBody({ query, onPick }: { query: string; onPick: () => void }) {
  const { t: translate } = useTranslation();
  const navigate = useNavigate();
  const [debounced, setDebounced] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debounced.length < 2) {
      return;
    }
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- brief loading flag for the debounced fetch
    setIsLoading(true);
    api
      .get<{ hits: SearchHit[] }>('/search', { params: { q: debounced, types: TYPES, limit: 20 } })
      .then(({ data }) => {
        if (active) setHits(Array.isArray(data.hits) ? data.hits : []);
      })
      .catch(() => {
        if (active) setHits([]);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [debounced]);

  const go = (path: string | null) => {
    if (!path) return;
    onPick();
    navigate(path);
  };

  if (debounced.length < 2) {
    return <CommandEmpty>{translate('search.min_chars')}</CommandEmpty>;
  }
  if (isLoading && hits.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> {translate('search.searching')}
      </div>
    );
  }
  if (hits.length === 0) {
    return <CommandEmpty>{translate('search.no_results')}</CommandEmpty>;
  }

  const groups = GROUPS.map((g) => ({ ...g, rows: hits.filter((h) => h.type === g.type) })).filter(
    (g) => g.rows.length > 0,
  );

  return (
    <>
      {groups.map((group, idx) => {
        const Icon = group.icon;
        return (
          <div key={group.type}>
            {idx > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={translate(group.label)}>
              {group.rows.map((hit) => (
                <CommandItem
                  key={`${hit.type}-${hit.id}`}
                  value={`${hit.type}-${hit.id}`}
                  disabled={routeFor(hit) === null}
                  onSelect={() => go(routeFor(hit))}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate">{stripHighlight(hit.title) || translate('search.untitled')}</div>
                    {hit.snippet ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {stripHighlight(hit.snippet)}
                      </div>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </div>
        );
      })}
    </>
  );
}
