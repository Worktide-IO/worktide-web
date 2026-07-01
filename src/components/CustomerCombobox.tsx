import { useList, useOne } from '@refinedev/core';
import { Building2, Check, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { CustomerJsonld } from '@/api/types/customer/Jsonld';
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
  /** Currently-selected customer IRI (or null/empty for none). */
  value: string | null | undefined;
  /** Fires with the new IRI, or null when cleared. */
  onChange: (next: string | null) => void;
  placeholder?: string;
  className?: string;
};

const PAGE_SIZE = 25;

/**
 * Searchable single-select for a customer. Workspaces can have thousands of
 * customers and the API pages at 30, so this searches SERVER-SIDE (name partial
 * filter, debounced) rather than loading + filtering the whole list. The
 * selected customer is fetched by IRI so its name shows even when it isn't in
 * the current result page.
 */
export function CustomerCombobox({ value, onChange, placeholder = 'Kunde wählen…', className }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { result } = useList<Row<CustomerJsonld>>({
    resource: 'customers',
    filters: debounced ? [{ field: 'name', operator: 'contains', value: debounced }] : [],
    pagination: { currentPage: 1, pageSize: PAGE_SIZE },
    sorters: [{ field: 'name', order: 'asc' }],
    queryOptions: { enabled: open },
  });
  const options = useMemo(() => result?.data ?? [], [result]);

  // Resolve the selected customer's name (may not be in the current page).
  const selectedId = value ? value.split('/').pop() : undefined;
  const { result: selectedOne } = useOne<Row<CustomerJsonld>>({
    resource: 'customers',
    id: selectedId ?? '',
    queryOptions: { enabled: Boolean(selectedId) },
  });
  // In this Refine version useOne's `result` is the record itself, not `{ data }`.
  const selectedName = selectedOne?.name;

  const pick = (iri: string | null) => {
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
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="flex-1 truncate text-left">{selectedName ?? '…'}</span>
          ) : (
            <span className="flex-1 truncate text-left text-muted-foreground">{placeholder}</span>
          )}
          {value ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Kunde entfernen"
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
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Kunde suchen…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>Kein Kunde gefunden.</CommandEmpty>
            <CommandGroup heading="— Intern (kein Kunde)">
              <CommandItem value="__none__" onSelect={() => pick(null)} className="gap-2">
                <span className="flex-1 truncate text-muted-foreground">— Intern (kein Kunde)</span>
                {!value ? <Check className="size-3.5" /> : null}
              </CommandItem>
            </CommandGroup>
            {options.length > 0 ? (
              <CommandGroup heading="Kunden">
                {options.map((c) => {
                  const iri = c['@id'] ?? '';
                  return (
                    <CommandItem key={iri} value={iri} onSelect={() => pick(iri)} className="gap-2">
                      <span className="flex-1 truncate">{c.name}</span>
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
