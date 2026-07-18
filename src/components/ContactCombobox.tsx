import { useList, useOne } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Check, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { ContactJsonld } from '@/api/types/contact/Jsonld';
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
  /** Currently-selected contact IRI (or null/empty for none). */
  value: string | null | undefined;
  /** Fires with the new IRI. */
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
};

const PAGE_SIZE = 25;

const fullName = (c: Row<ContactJsonld>): string =>
  [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || (c.email ?? '—');

/**
 * Searchable single-select for a contact (server-side lastName filter,
 * debounced), mirroring ProjectCombobox. Used to attach an inbox sender to an
 * existing contact.
 */
export function ContactCombobox({ value, onChange, placeholder, className }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(h);
  }, [query]);

  const { result } = useList<Row<ContactJsonld>>({
    resource: 'contacts',
    filters: debounced ? [{ field: 'lastName', operator: 'contains', value: debounced }] : [],
    pagination: { currentPage: 1, pageSize: PAGE_SIZE },
    sorters: [{ field: 'lastName', order: 'asc' }],
    queryOptions: { enabled: open },
  });
  const options = useMemo(() => result?.data ?? [], [result]);

  const selectedId = value ? value.split('/').pop() : undefined;
  const { result: selectedOne } = useOne<Row<ContactJsonld>>({
    resource: 'contacts',
    id: selectedId ?? '',
    queryOptions: { enabled: Boolean(selectedId) },
  });

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
          <User className="size-3.5 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="flex-1 truncate text-left">{selectedOne ? fullName(selectedOne) : '…'}</span>
          ) : (
            <span className="flex-1 truncate text-left text-muted-foreground">
              {placeholder ?? t('combobox.select_contact')}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t('combobox.search_contact')} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{t('combobox.no_contact')}</CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup>
                {options.map((c) => {
                  const iri = c['@id'] ?? '';
                  return (
                    <CommandItem key={iri} value={iri} onSelect={() => pick(iri)} className="gap-2">
                      <span className="flex-1 truncate">{fullName(c)}</span>
                      {c.email ? (
                        <span className="truncate text-[10px] text-muted-foreground">{c.email}</span>
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
