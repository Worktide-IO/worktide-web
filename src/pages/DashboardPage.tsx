import { useGetIdentity, useLogout, useList } from '@refinedev/core';

type Identity = { id: string; email: string; name: string };
type ProjectRow = { id: string; name: string; key: string; status?: { name?: string } };

/**
 * Stub dashboard for the very first end-to-end run. Once the real data is
 * flowing it shows the authenticated user, the active workspace slug, and
 * a sanity list of projects.
 *
 * Replace with the Refine resource layout (`<Refine resources={...}>`) once
 * the second CRUD page lands; the inline useList here is just to prove
 * the data-provider round-trip works against API Platform.
 */
export function DashboardPage() {
  const { data: identity } = useGetIdentity<Identity>();
  const { mutate: logout } = useLogout();
  const { result: projects, query } = useList<ProjectRow>({
    resource: 'projects',
    pagination: { currentPage: 1, pageSize: 10 },
    sorters: [{ field: 'updatedAt', order: 'desc' }],
  });
  const isLoading = query.isLoading;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <h1 className="text-lg">Worktide</h1>
        <div className="flex items-center gap-4 text-sm">
          {identity ? <span>{identity.name ?? identity.email}</span> : null}
          <button
            type="button"
            onClick={() => logout()}
            className="text-muted-foreground hover:text-foreground"
          >
            Abmelden
          </button>
        </div>
      </header>

      <main className="p-6 space-y-6">
        <section className="space-y-2">
          <h2 className="text-xl">Projekte</h2>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Lade …</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border bg-card">
              {projects?.data?.map((p: ProjectRow) => (
                <li key={p.id} className="px-4 py-3 flex items-center justify-between">
                  <span>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{p.key}</span>
                    {p.name}
                  </span>
                  {p.status?.name ? (
                    <span className="text-xs text-muted-foreground">{p.status.name}</span>
                  ) : null}
                </li>
              ))}
              {projects?.data?.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Keine Projekte sichtbar.
                </li>
              ) : null}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
