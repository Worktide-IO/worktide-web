import { ChevronDown, ChevronRight, Lock, Plus, Search, User as UserIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { ProjectJsonld } from '@/api/types/project/Jsonld';
import type { UserJsonld } from '@/api/types/user/Jsonld';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { Row } from '@/lib/refine';
import { cn } from '@/lib/utils';

/**
 * Left rail of the planner — 3-way quick-add at the top, user avatar
 * carousel below it, project filter at the bottom.
 *
 *  3-way Add: "Neue / Meine / Private Aufgabe" routes to /tasks
 *  with a `?scope=` query so the create dialog there pre-fills the
 *  scope. Keeps the planner from owning its own create-modal —
 *  one source of truth for task creation.
 *
 *  Avatars: small toggle chips, empty = "show all". Filters which
 *  user columns the planner renders. Persists in URL hash would be
 *  nice in a follow-up; for now it's session-state.
 *
 *  Projects: search-input + multi-select checkboxes. `null` activeIris
 *  means "all projects allowed" (default); a non-null array narrows.
 */
export function PlannerSidebar({
  users,
  projects,
  activeUserIris,
  setActiveUserIris,
  activeProjectIris,
  setActiveProjectIris,
}: {
  users: Row<UserJsonld>[];
  projects: Row<ProjectJsonld>[];
  activeUserIris: string[];
  setActiveUserIris: (iris: string[]) => void;
  activeProjectIris: string[] | null;
  setActiveProjectIris: (iris: string[] | null) => void;
}) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showAllProjects, setShowAllProjects] = useState(true);

  const toggleUser = (iri: string) => {
    if (activeUserIris.includes(iri)) {
      setActiveUserIris(activeUserIris.filter((x) => x !== iri));
    } else {
      setActiveUserIris([...activeUserIris, iri]);
    }
  };

  const toggleProject = (iri: string) => {
    const current = activeProjectIris ?? [];
    if (current.includes(iri)) {
      const next = current.filter((x) => x !== iri);
      setActiveProjectIris(next.length === 0 ? null : next);
    } else {
      setActiveProjectIris([...current, iri]);
    }
  };

  const filteredProjects = useMemo(() => {
    if (!search.trim()) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) =>
      (p.name?.toLowerCase().includes(q) ?? false) ||
      (p.key?.toLowerCase().includes(q) ?? false),
    );
  }, [projects, search]);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Neue Aufgabe</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 p-3 pt-0">
          {/* Three-way quick-add — scope as URL query so the existing
              task-create dialog at /tasks can pre-set the type. */}
          <Button
            size="sm"
            variant="default"
            className="w-full justify-start"
            onClick={() => navigate('/tasks?new=any')}
          >
            <Plus className="size-4" /> Neue Aufgabe
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => navigate('/tasks?new=mine')}
          >
            <UserIcon className="size-4" /> Meine Aufgabe
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={() => navigate('/tasks?new=private')}
          >
            <Lock className="size-4" /> Private Aufgabe
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Personen ({activeUserIris.length === 0 ? users.length : activeUserIris.length})</span>
            {activeUserIris.length > 0 ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={() => setActiveUserIris([])}
              >
                Alle
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <div className="flex flex-wrap gap-1">
            {users.map((u) => {
              const iri = u['@id'] ?? '';
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || '?';
              const initials = name
                .split(/\s+/)
                .slice(0, 2)
                .map((s) => s[0]?.toUpperCase() ?? '')
                .join('') || '?';
              const active = activeUserIris.length === 0 || activeUserIris.includes(iri);
              return (
                <button
                  key={iri}
                  type="button"
                  onClick={() => toggleUser(iri)}
                  className={cn(
                    'rounded-full ring-2 transition-all',
                    active ? 'ring-primary' : 'ring-transparent opacity-40 hover:opacity-70',
                  )}
                  title={name}
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                  </Avatar>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAllProjects((s) => !s)}
              className="flex items-center gap-1"
            >
              {showAllProjects ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
              Projekte
            </button>
            {activeProjectIris ? (
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0 text-xs"
                onClick={() => setActiveProjectIris(null)}
              >
                Alle
              </Button>
            ) : null}
          </CardTitle>
        </CardHeader>
        {showAllProjects ? (
          <CardContent className="space-y-2 p-3 pt-0">
            <div className="relative">
              <Search className="absolute left-2 top-2 size-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Projekt suchen…"
                className="h-7 pl-7 text-xs"
              />
            </div>
            <div className="max-h-[40vh] space-y-1 overflow-y-auto">
              {filteredProjects.map((p) => {
                const iri = p['@id'] ?? '';
                const active = activeProjectIris === null || activeProjectIris.includes(iri);
                return (
                  <label
                    key={iri}
                    className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted/30"
                  >
                    <Checkbox
                      checked={active}
                      onCheckedChange={() => toggleProject(iri)}
                    />
                    <span
                      className="block size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color ?? '#94a3b8' }}
                    />
                    <span className="truncate">{p.name}</span>
                  </label>
                );
              })}
              {filteredProjects.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Keine Treffer.
                </p>
              ) : null}
            </div>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
