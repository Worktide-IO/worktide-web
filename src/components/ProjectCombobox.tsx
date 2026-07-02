import { useList, useOne } from '@refinedev/core';
import { Check, FolderKanban } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
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
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

type Props = {
  /** Currently-selected project IRI (or null/empty for none). */
  value: string | null | undefined;
  /** Fires with the new IRI. */
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
};

const PAGE_SIZE = 25;

/**
 * Searchable single-select for a project (server-side name filter, debounced),
 * mirroring CustomerCombobox. Used where a project must be chosen — e.g. before
 * accepting a ticket suggestion that has no suggested project.
 */
export function ProjectCombobox({ value, onChange, placeholder = 'Projekt wählen…', className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { result } = useList<Row<ProjectJsonld>>({
    resource: 'projects',
    filters: debounced ? [{ field: 'name', operator: 'contains', value: debounced }] : [],
    pagination: { currentPage: 1, pageSize: PAGE_SIZE },
    sorters: [{ field: 'name', order: 'asc' }],
    queryOptions: { enabled: open },
  });
  const options = useMemo(() => result?.data ?? [], [result]);

  const selectedId = value ? value.split('/').pop() : undefined;
  const { result: selectedOne } = useOne<Row<ProjectJsonld>>({
    resource: 'projects',
    id: selectedId ?? '',
    queryOptions: { enabled: Boolean(selectedId) },
  });
  const selectedName = selectedOne?.name;

  const pick = (iri: string) => {
    onChange(iri);
    setOpen(false);
    setQuery('');
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
          <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="flex-1 truncate text-left">{selectedName ?? '…'}</span>
          ) : (
            <span className="flex-1 truncate text-left text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Projekt suchen…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Kein Projekt gefunden.</CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup heading="Projekte">
                {options.map((p) => {
                  const iri = p['@id'] ?? '';
                  return (
                    <CommandItem key={iri} value={iri} onSelect={() => pick(iri)} className="gap-2">
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.key ? (
                        <span className="font-mono text-[10px] text-muted-foreground">{p.key}</span>
                      ) : null}
                      {value === iri ? <Check className="size-3.5" /> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
