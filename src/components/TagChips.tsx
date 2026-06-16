import type { TagJsonld } from '@/api/types/tag/Jsonld';
import type { Row } from '@/lib/refine';
import { useTags } from '@/hooks/useTags';
import { cn } from '@/lib/utils';

type Props = {
  /** Tag IRIs (the array on Task.tags / Project.tags). */
  iris: string[] | null | undefined;
  /** Cap the number of chips before falling back to "+N". 0 = no cap. */
  max?: number;
  /** Visual density — `sm` is the kanban-card variant. */
  size?: 'sm' | 'default';
  className?: string;
};

/**
 * Read-only colored pill display for a list of tag IRIs.
 *
 * The color comes from Tag.color (hex). Background uses ~15% opacity
 * of that color so the chip stays readable on light + dark themes;
 * text + border render in the full color (or near-black/near-white
 * for accessibility).
 */
export function TagChips({ iris, max = 0, size = 'default', className }: Props) {
  const { byIri } = useTags();
  const list = (iris ?? []).map((iri) => byIri[iri]).filter(Boolean) as Row<TagJsonld>[];
  if (list.length === 0) return null;

  const visible = max > 0 ? list.slice(0, max) : list;
  const overflow = max > 0 ? list.length - visible.length : 0;
  const pad = size === 'sm' ? 'px-1.5 py-0' : 'px-2 py-0.5';
  const text = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      {visible.map((t) => (
        <TagChip key={t['@id']} tag={t} pad={pad} text={text} />
      ))}
      {overflow > 0 ? (
        <span
          className={cn(
            'rounded-full border border-border bg-muted text-muted-foreground',
            pad,
            text,
          )}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}

function TagChip({
  tag,
  pad,
  text,
}: {
  tag: Row<TagJsonld>;
  pad: string;
  text: string;
}) {
  const color = tag.color ?? '#94a3b8';
  // Opacity-15 background via 8-digit hex so we don't need a Tailwind
  // dynamic class. 26 in hex ≈ 15%.
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border font-medium', pad, text)}
      style={{
        backgroundColor: `${color}26`,
        borderColor: `${color}66`,
        color: color,
      }}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {tag.name}
    </span>
  );
}
