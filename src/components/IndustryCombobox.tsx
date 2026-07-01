import { useInvalidate, useList } from '@refinedev/core';
import { Building, Check, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import type { IndustryJsonld } from '@/lib/industry';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type Props = {
  /** Currently-selected industry IRI (or null/empty). */
  value: string | null | undefined;
  /** Fires with the new IRI, or null when cleared. */
  onChange: (next: string | null) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Single-select type-ahead for a customer's industry, backed by the managed
 * Industry vocabulary. Typing filters the list; a query with no exact match
 * offers "+ „<query>" anlegen" which POSTs a new Industry and selects it.
 * Mirrors {@link ./TagPicker} but single-valued.
 */
export function IndustryCombobox({ value, onChange, placeholder = 'Branche wählen…', className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const invalidate = useInvalidate();

  const { result } = useList<Row<IndustryJsonld>>({
    resource: 'industries',
    pagination: { mode: 'off' },
    sorters: [{ field: 'position', order: 'asc' }],
  });

  const industries = useMemo(
    () => (result?.data ?? []).filter((i) => i.isArchived !== true),
    [result],
  );
  const byIri = useMemo(() => {
    const m: Record<string, Row<IndustryJsonld>> = {};
    for (const i of industries) if (i['@id']) m[i['@id']] = i;
    return m;
  }, [industries]);

  const selected = value ? byIri[value] : undefined;
  const exact = industries.some((i) => (i.name ?? '').toLowerCase() === query.trim().toLowerCase());
  const showCreate = query.trim().length > 0 && !exact;

  const pick = (iri: string) => {
    onChange(iri);
    setOpen(false);
    setQuery('');
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
      const { data } = await api.post<{ '@id'?: string }>('/industries', {
        name,
        workspace: `/v1/workspaces/${workspaceId}`,
      });
      void invalidate({ resource: 'industries', invalidates: ['list'] });
      if (data['@id']) pick(data['@id']);
      toast.success(`Branche „${name}" angelegt`);
    } catch {
      toast.error('Konnte Branche nicht anlegen.');
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
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-start gap-2 font-normal', className)}
        >
          <Building className="size-3.5 shrink-0 text-muted-foreground" />
          {selected ? (
            <span className="flex-1 truncate text-left">{selected.name}</span>
          ) : (
            <span className="flex-1 truncate text-left text-muted-foreground">{placeholder}</span>
          )}
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Branche entfernen"
              className="ml-auto rounded p-0.5 hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
            >
              <X className="size-3.5 text-muted-foreground" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Suchen oder anlegen…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Tippen, um eine neue Branche anzulegen.</CommandEmpty>
            {industries.length > 0 ? (
              <CommandGroup heading="Branchen">
                {industries.map((i) => {
                  const iri = i['@id'] ?? '';
                  return (
                    <CommandItem key={iri} value={i.name ?? iri} onSelect={() => pick(iri)} className="gap-2">
                      <span className="flex-1 truncate">{i.name}</span>
                      {value === iri ? <Check className="size-3.5" /> : null}
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
                  disabled={creating}
                  className="gap-2"
                >
                  <Plus className="size-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">„{query.trim()}" anlegen</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
