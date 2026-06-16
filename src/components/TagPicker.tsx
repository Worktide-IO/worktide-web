import { useInvalidate } from '@refinedev/core';
import { Check, Plus, Tag as TagIcon, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { TagJsonld } from '@/api/types/tag/Jsonld';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useTags } from '@/hooks/useTags';
import { api } from '@/lib/api';
import { WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

type Props = {
  /** Currently-selected tag IRIs. */
  value: string[];
  /** Called with the new IRI list whenever the user toggles a tag. */
  onChange: (next: string[]) => void;
  /** Workspace-scope narrowing for the dropdown + create. */
  scope?: 'project' | 'task' | 'customer';
  /** Optional tag-create disabled mode (for filter-only popovers). */
  disableCreate?: boolean;
  /** Custom trigger label when empty (default: "Tags wählen…"). */
  placeholder?: string;
  className?: string;
};

const SWATCHES = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#94a3b8',
];

/**
 * Multi-select Combobox for Tag-Picking with inline "Tag anlegen".
 *
 * Selection state lives in the parent (controlled). When the user toggles
 * a tag, `onChange` fires with the full new IRI list — the parent decides
 * whether to PATCH the owning entity or just stash the filter.
 *
 * Creating a tag: a free-text query that doesn't match any existing tag
 * shows a "+ "<query>" anlegen"-row at the bottom. Clicking it POSTs
 * to /v1/tags with a default colour from the SWATCHES rotation, then
 * adds the new IRI to the selection.
 */
export function TagPicker({
  value,
  onChange,
  scope,
  disableCreate = false,
  placeholder = 'Tags wählen…',
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const invalidate = useInvalidate();

  const { tags, byIri } = useTags(scope);
  const selected = useMemo(
    () => (value ?? []).map((iri) => byIri[iri]).filter(Boolean) as Row<TagJsonld>[],
    [value, byIri],
  );

  const exactMatch = tags.some((t) => (t.name ?? '').toLowerCase() === query.trim().toLowerCase());
  const showCreate = !disableCreate && query.trim().length > 0 && !exactMatch;

  const toggle = (iri: string) => {
    const next = value.includes(iri) ? value.filter((i) => i !== iri) : [...value, iri];
    onChange(next);
  };

  const handleCreate = async () => {
    const name = query.trim();
    if (!name) return;
    const workspaceId =
      typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;
    if (!workspaceId) {
      toast.error('Workspace nicht gefunden.');
      return;
    }
    setCreating(true);
    try {
      // Auto-rotate through swatch colours so tags don't all look the same.
      const colour = SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
      const { data } = await api.post<{ '@id'?: string }>('/tags', {
        name,
        color: colour,
        scope: scope ?? 'any',
        workspace: `/v1/workspaces/${workspaceId}`,
      });
      void invalidate({ resource: 'tags', invalidates: ['list'] });
      if (data['@id']) {
        onChange([...value, data['@id']]);
      }
      setQuery('');
      toast.success(`Tag "${name}" angelegt`);
    } catch {
      toast.error('Konnte Tag nicht anlegen.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn('h-auto min-h-9 justify-start gap-1 flex-wrap', className)}
        >
          <TagIcon className="size-3.5 shrink-0 text-muted-foreground" />
          {selected.length === 0 ? (
            <span className="text-muted-foreground">{placeholder}</span>
          ) : (
            selected.map((t) => (
              <span
                key={t['@id']}
                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium"
                style={{
                  backgroundColor: `${t.color ?? '#94a3b8'}26`,
                  borderColor: `${t.color ?? '#94a3b8'}66`,
                  color: t.color ?? '#94a3b8',
                }}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: t.color ?? '#94a3b8' }}
                />
                {t.name}
              </span>
            ))
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Suchen oder anlegen…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>
              {disableCreate
                ? 'Keine Tags gefunden.'
                : 'Tippen, um einen neuen Tag anzulegen.'}
            </CommandEmpty>
            {tags.length > 0 ? (
              <CommandGroup heading="Vorhandene">
                {tags.map((t) => {
                  const iri = t['@id'] ?? '';
                  const active = value.includes(iri);
                  return (
                    <CommandItem
                      key={iri}
                      value={t.name ?? iri}
                      onSelect={() => toggle(iri)}
                      className="gap-2"
                    >
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color ?? '#94a3b8' }}
                      />
                      <span className="flex-1 truncate">{t.name}</span>
                      {active ? <Check className="size-3.5 text-foreground" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
            {showCreate ? (
              <CommandGroup heading="Neu">
                <CommandItem
                  value={`__create__${query}`}
                  onSelect={handleCreate}
                  className="gap-2"
                  disabled={creating}
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">"{query.trim()}" anlegen</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {selected.length > 0 ? (
              <CommandGroup heading="Auswahl">
                {selected.map((t) => (
                  <CommandItem
                    key={`sel-${t['@id']}`}
                    value={`sel-${t.name}`}
                    onSelect={() => t['@id'] && toggle(t['@id'])}
                    className="gap-2"
                  >
                    <X className="size-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{t.name} entfernen</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
