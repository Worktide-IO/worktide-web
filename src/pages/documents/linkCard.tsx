import { createReactInlineContentSpec } from '@blocknote/react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/**
 * Card-style inline reference to a Worktide entity (project / task /
 * document / customer). Stored on the block as a `link-card` inline
 * content with two props:
 *
 *   - url      — the canonical reference (a full URL, an IRI, or a
 *                task identifier like WORK-12). The renderer is what
 *                turns this into a fresh API call.
 *   - fallback — human label cached at insertion time so the chip
 *                still reads sensibly if the resolve fails (deleted
 *                target, permission denied, network blip).
 *
 * The renderer lazy-fetches `/v1/links/resolve?url=…` on mount; the
 * response carries title + type + status which we draw as a chip.
 * Cache lives in module-scope so a document with multiple references
 * to the same task only resolves once.
 */
type ResolveResult = {
  type: 'project' | 'task' | 'document' | 'customer';
  url: string;
  title: string;
  subtitle?: string | null;
  status?: string;
  statusCompleted?: boolean;
  priority?: string;
  isPrio?: boolean;
  color?: string;
  emoji?: string | null;
};

const cache = new Map<string, Promise<ResolveResult | null>>();

function resolve(url: string): Promise<ResolveResult | null> {
  if (cache.has(url)) return cache.get(url)!;
  const p = api
    .get<ResolveResult>('/links/resolve', { params: { url } })
    .then((r) => r.data)
    .catch(() => null);
  cache.set(url, p);
  return p;
}

const TYPE_TONE: Record<ResolveResult['type'], string> = {
  project: 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300',
  task: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
  document: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
  customer: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-300',
};

function LinkCardRender({ url, fallback }: { url: string; fallback?: string }) {
  const [data, setData] = useState<ResolveResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    resolve(url).then((r) => {
      if (!alive) return;
      if (r) setData(r);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  if (!data && !failed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-muted/30 px-1.5 py-0 align-baseline text-[0.85em] text-muted-foreground">
        {fallback || url}…
      </span>
    );
  }

  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-muted/30 px-1.5 py-0 align-baseline text-[0.85em] text-muted-foreground">
        {fallback || url}
      </span>
    );
  }

  const r = data!;
  const completed = r.statusCompleted === true;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0 align-baseline text-[0.85em] font-medium ${TYPE_TONE[r.type]}`}
      title={r.title}
    >
      <span className="opacity-70">{r.emoji ?? typeBadge(r.type)}</span>
      {r.subtitle ? (
        <span className="font-mono text-[0.85em] opacity-70">{r.subtitle}</span>
      ) : null}
      <span className={completed ? 'line-through opacity-60' : ''}>{r.title}</span>
      {r.status && !['task', 'project'].includes(r.type) ? null : null}
    </span>
  );
}

function typeBadge(t: ResolveResult['type']): string {
  return ({ project: '▣', task: '✓', document: '📄', customer: '🏢' } as const)[t];
}

export const LinkCard = createReactInlineContentSpec(
  {
    type: 'linkcard',
    propSchema: {
      url: { default: '' },
      fallback: { default: '' },
    },
    content: 'none',
  } as const,
  {
    render: (props) => (
      <LinkCardRender
        url={props.inlineContent.props.url}
        fallback={props.inlineContent.props.fallback}
      />
    ),
  },
);

/**
 * Quick paste-handler helper: returns the canonical reference token
 * if the pasted string looks like a Worktide link, else null.
 *
 * Accepted shapes:
 *   https://<host>/projects/<uuid>
 *   https://<host>/tasks/<uuid>
 *   https://<host>/documents/<uuid>
 *   https://<host>/customers/<uuid>
 *   /v1/(projects|tasks|documents|customers)/<uuid>
 *   WORK-123 / WIKI-2 (task identifier)
 */
export function detectWorktideLink(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  // Same-origin only — we don't want to render external-looking URLs
  // pointing at someone else's host as Worktide cards.
  const ownOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  if (
    /^https?:\/\/[^/]+\/(projects|tasks|documents|customers)\/[0-9a-f-]{36}/i.test(trimmed) &&
    (ownOrigin === '' || trimmed.startsWith(ownOrigin))
  ) {
    return trimmed;
  }
  if (/^\/v1\/(projects|tasks|documents|customers)\/[0-9a-f-]{36}$/i.test(trimmed)) {
    return trimmed;
  }
  if (/^[A-Z][A-Z0-9]{1,15}-[A-Z0-9]+$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}
