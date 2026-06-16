import { useQuery } from '@tanstack/react-query';
import { Link2, Loader2 } from 'lucide-react';

import { api } from '@/lib/api';

type Backlink = {
  id: string;
  '@id': string;
  name: string;
  emoji: string | null;
  snippet: string | null;
};

type BacklinksResponse = {
  document: string;
  count: number;
  backlinks: Backlink[];
};

type Props = {
  documentId: string;
  onOpen: (id: string) => void;
};

/**
 * Section at the bottom of a document page: "Wird verlinkt von".
 * Calls /v1/documents/{id}/backlinks which scans every other doc in
 * the workspace whose body contains the current document's UUID as a
 * substring. Each row links back to the editor for the referring page
 * via the parent's onOpen handler.
 *
 * Snippet rendering: the backend strips JSON noise and returns ~120
 * chars around the match. We render it as muted text — good enough
 * for the user to recognise context without opening every backlink.
 *
 * When there are zero backlinks the section collapses to a one-line
 * "noch keine" hint so the editor doesn't end with empty whitespace.
 */
export function DocumentBacklinksPanel({ documentId, onOpen }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['document-backlinks', documentId],
    queryFn: async (): Promise<BacklinksResponse> => {
      const { data } = await api.get<BacklinksResponse>(`/documents/${documentId}/backlinks`);
      return data;
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="border-t px-6 py-4 text-xs text-muted-foreground">
        <Loader2 className="inline-block size-3 animate-spin" /> Backlinks laden…
      </div>
    );
  }

  const links = data?.backlinks ?? [];
  return (
    <div className="border-t px-6 py-4">
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <Link2 className="size-3" />
        Wird verlinkt von ({data?.count ?? 0})
      </h4>
      {links.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          Noch keine Verlinkungen. Sobald eine andere Seite diese hier referenziert,
          erscheint sie hier.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((b) => (
            <li
              key={b['@id']}
              className="cursor-pointer rounded-md border bg-muted/20 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
              onClick={() => onOpen(b.id)}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {b.emoji ? <span>{b.emoji}</span> : null}
                {b.name}
              </div>
              {b.snippet ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {b.snippet}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
