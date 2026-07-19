import { createReactInlineContentSpec } from '@blocknote/react';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { detectWorktideLink } from './linkCard';

/**
 * Card-style inline chip for an EXTERNAL URL (YouTube, Figma, a blog
 * post, …) — the counterpart to {@link LinkCard}, which renders
 * INTERNAL Worktide entity references.
 *
 * Two props are persisted on the block:
 *   - url      — the external URL (source of truth for the resolve call).
 *   - fallback — human label cached at insertion time (the URL/host) so
 *                the chip still reads if the preview resolve returns nothing
 *                (egress off, SSRF-blocked, or no metadata → backend 204).
 *
 * The renderer lazy-fetches `/v1/links/preview?url=…` on mount and draws a
 * favicon + title + provider chip. The backend does the egress-gated,
 * SSRF-guarded oEmbed/OpenGraph fetch; the browser never hits the third
 * party for metadata (only the favicon/thumbnail images render directly).
 * Module-scope cache dedups repeated references to the same URL.
 */
type PreviewResult = {
  url: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  provider?: string | null;
  faviconUrl?: string | null;
};

const cache = new Map<string, Promise<PreviewResult | null>>();

function resolvePreview(url: string): Promise<PreviewResult | null> {
  if (cache.has(url)) return cache.get(url)!;
  const p = api
    .get<PreviewResult | ''>('/links/preview', { params: { url } })
    // 204 No Content → axios yields an empty string; treat as "no preview".
    .then((r) => (r.data && typeof r.data === 'object' ? r.data : null))
    .catch(() => null);
  cache.set(url, p);
  return p;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function ExternalLinkCardRender({ url, fallback }: { url: string; fallback?: string }) {
  const [data, setData] = useState<PreviewResult | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let alive = true;
    resolvePreview(url).then((r) => {
      if (!alive) return;
      setData(r);
      setResolved(true);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  // While resolving: dashed placeholder chip so there's no layout jump.
  if (!resolved) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-muted/30 px-1.5 py-0 align-baseline text-[0.85em] text-muted-foreground">
        {fallback || hostOf(url)}…
      </span>
    );
  }

  const title = data?.title ?? fallback ?? hostOf(url);
  const provider = data?.provider ?? hostOf(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={data?.description ?? url}
      className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0 align-baseline text-[0.85em] font-medium text-foreground no-underline transition-colors hover:bg-muted"
    >
      {data?.faviconUrl ? (
        <img
          src={data.faviconUrl}
          alt=""
          className="size-3.5 shrink-0 rounded-sm"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <ExternalLink className="size-3.5 shrink-0 opacity-60" />
      )}
      <span className="truncate">{title}</span>
      {provider ? <span className="shrink-0 text-[0.85em] text-muted-foreground">· {provider}</span> : null}
    </a>
  );
}

export const ExternalLinkCard = createReactInlineContentSpec(
  {
    type: 'externallinkcard',
    propSchema: {
      url: { default: '' },
      fallback: { default: '' },
    },
    content: 'none',
  } as const,
  {
    render: (props) => (
      <ExternalLinkCardRender
        url={props.inlineContent.props.url}
        fallback={props.inlineContent.props.fallback}
      />
    ),
  },
);

/**
 * Returns the URL if the pasted text is an external http(s) link worth
 * rendering as a rich card — i.e. an absolute http(s) URL that is NOT a
 * same-origin Worktide entity link (those are handled by
 * {@link detectWorktideLink} → the internal LinkCard).
 */
export function detectExternalLink(text: string): string | null {
  const trimmed = text.trim();
  // Single-token absolute http(s) URL with a host — no whitespace.
  if (trimmed === '' || /\s/.test(trimmed)) return null;
  if (!/^https?:\/\/[^/\s]+(\/|$)/i.test(trimmed)) return null;
  // Internal Worktide references take precedence (rendered by LinkCard).
  if (detectWorktideLink(trimmed)) return null;
  return trimmed;
}
