import { useList, useOne } from '@refinedev/core';
import { useTranslation } from 'react-i18next';
import { Check, CheckSquare } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { TaskJsonld } from '@/api/types/task/Jsonld';
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
  /** Currently-selected task IRI (or null/empty for none). */
  value: string | null | undefined;
  /** Fires with the new IRI. */
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
};

const PAGE_SIZE = 25;

/**
 * Searchable single-select for a task (server-side title filter, debounced),
 * mirroring ProjectCombobox. Used where an existing task must be picked — e.g.
 * linking a discovered external ticket to a local task.
 */
export function TaskCombobox({ value, onChange, placeholder, className }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(id);
  }, [query]);

  const { result } = useList<Row<TaskJsonld>>({
    resource: 'tasks',
    filters: debounced ? [{ field: 'title', operator: 'contains', value: debounced }] : [],
    pagination: { currentPage: 1, pageSize: PAGE_SIZE },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
    queryOptions: { enabled: open },
  });
  const options = useMemo(() => result?.data ?? [], [result]);

  const selectedId = value ? value.split('/').pop() : undefined;
  const { result: selectedOne } = useOne<Row<TaskJsonld>>({
    resource: 'tasks',
    id: selectedId ?? '',
    queryOptions: { enabled: Boolean(selectedId) },
  });
  const selectedTitle = selectedOne?.title;

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
          <CheckSquare className="size-3.5 shrink-0 text-muted-foreground" />
          {value ? (
            <span className="flex-1 truncate text-left">{selectedTitle ?? '…'}</span>
          ) : (
            <span className="flex-1 truncate text-left text-muted-foreground">
              {placeholder ?? t('combobox.select_task')}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={t('combobox.search_task')} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{t('combobox.no_task')}</CommandEmpty>
            {options.length > 0 ? (
              <CommandGroup heading={t('nav.tasks')}>
                {options.map((task) => {
                  const iri = task['@id'] ?? '';
                  return (
                    <CommandItem key={iri} value={iri} onSelect={() => pick(iri)} className="gap-2">
                      <span className="flex-1 truncate">{task.title}</span>
                      {task.identifier ? (
                        <span className="font-mono text-[10px] text-muted-foreground">{task.identifier}</span>
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
