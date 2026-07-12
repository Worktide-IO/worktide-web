import { useInvalidate } from '@refinedev/core';
import { Check, Loader2, Plus, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { aiErrorMessage, aiTags, type SuggestedTag } from '@/lib/ai';
import { api, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Same palette TagPicker rotates through when creating a tag.
const SWATCHES = [
  '#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#8b5cf6', '#ec4899', '#94a3b8',
];

type Props = {
  /** Tag scope / suggestion target, e.g. 'contact' | 'product'. */
  scope: string;
  /** Currently-selected tag IRIs (mirrors the sibling TagPicker's value). */
  value: string[];
  /** Receives the new IRI list when a suggestion is adopted. */
  onChange: (next: string[]) => void;
  /** Assemble the draft text from the current (unsaved) form fields. */
  getText: () => string;
  className?: string;
};

/**
 * On-demand "✨ AI tags" trigger to place next to a {@link TagPicker}. Sends the
 * current draft text to the generic /ai/suggest-tags endpoint and offers the
 * result as clickable chips: existing tags attach directly by IRI; proposed new
 * names are created on click (POST /tags in the record's scope) and then
 * attached. Works for both create and edit forms since it reads live field
 * values rather than the saved record. Nothing is applied automatically.
 */
export function TagSuggestButton({ scope, value, onChange, getText, className }: Props) {
  const { t: translate } = useTranslation();
  const invalidate = useInvalidate();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<SuggestedTag[]>([]);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);

  const workspaceId =
    typeof window !== 'undefined' ? localStorage.getItem(WORKSPACE_STORAGE_KEY) : null;

  const run = async () => {
    const text = getText().trim();
    if (text === '') {
      toast.info(translate('tag_suggest.need_content'));
      return;
    }
    if (!workspaceId) {
      toast.error(translate('toast.workspace_not_found'));
      return;
    }
    setLoading(true);
    try {
      const res = await aiTags.suggest({
        target: scope,
        text,
        workspace: `/v1/workspaces/${workspaceId}`,
      });
      setTags(res.tags ?? []);
      setNewTags(res.suggestedNewTags ?? []);
      setReasoning(res.reasoning ?? null);
      setOpen(true);
    } catch (err) {
      toast.error(aiErrorMessage(err, translate('tag_suggest.failed')));
    } finally {
      setLoading(false);
    }
  };

  const addExisting = (tag: SuggestedTag) => {
    if (!value.includes(tag.iri)) {
      onChange([...value, tag.iri]);
    }
  };

  const createNew = async (name: string) => {
    if (!workspaceId) {
      return;
    }
    setCreating(name);
    try {
      // Deterministic swatch per name (stable colour, and pure — no Math.random in a handler).
      const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const colour = SWATCHES[hash % SWATCHES.length];
      const { data } = await api.post<{ '@id'?: string }>('/tags', {
        name,
        color: colour,
        scope,
        workspace: `/v1/workspaces/${workspaceId}`,
      });
      void invalidate({ resource: 'tags', invalidates: ['list'] });
      if (data['@id'] && !value.includes(data['@id'])) {
        onChange([...value, data['@id']]);
      }
      setNewTags((prev) => prev.filter((n) => n !== name));
      toast.success(translate('toast.tag_created_sq', { name }));
    } catch {
      toast.error(translate('toast.could_not_create_tag'));
    } finally {
      setCreating(null);
    }
  };

  const empty = tags.length === 0 && newTags.length === 0;

  return (
    <Popover
      open={open}
      // The trigger click runs the fetch and opens only on success (below); a
      // stray "open" request from Radix is ignored, closing is honoured.
      onOpenChange={(next) => {
        if (!next) {
          setOpen(false);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={className}
          disabled={loading}
          onClick={() => void run()}
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {translate('tag_suggest.button')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="start">
        {reasoning ? <p className="text-xs text-muted-foreground">{reasoning}</p> : null}

        {empty ? (
          <p className="text-sm text-muted-foreground">{translate('tag_suggest.none')}</p>
        ) : null}

        {tags.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {translate('tag_suggest.existing')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const active = value.includes(tag.iri);
                return (
                  <button
                    key={tag.iri}
                    type="button"
                    onClick={() => addExisting(tag)}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}26`,
                      borderColor: `${tag.color}66`,
                      color: tag.color,
                    }}
                  >
                    {active ? <Check className="size-3" /> : <Plus className="size-3" />}
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {newTags.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {translate('tag_suggest.new')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {newTags.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={creating === name}
                  onClick={() => void createNew(name)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {creating === name ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
