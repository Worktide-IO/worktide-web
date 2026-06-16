import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
} from '@blocknote/core';
import { createReactInlineContentSpec } from '@blocknote/react';

import { LinkCard } from './linkCard';

/**
 * Custom inline content for `@user`-mentions in BlockNote.
 *
 * Two props are persisted on the block JSON:
 *   - `userIri`  — IRI of the mentioned user (the link to the source of truth)
 *   - `name`     — display name at the time of mention (so deleted users still
 *                  show as their last-known name instead of an empty chip).
 *
 * Render is a small inline pill styled with the same green hue we use for
 * tag chips so visual rhythm holds across the wiki. The chip is intentionally
 * non-clickable in V1 — opening a user-profile page is a follow-up; for now
 * the value is signalling "this is a real workspace member, not just text".
 */
export const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: {
      userIri: { default: '' },
      name: { default: '' },
    },
    content: 'none',
  } as const,
  {
    render: (props) => (
      <span
        data-mention
        className="inline-flex items-center gap-0.5 rounded-md bg-emerald-100 px-1.5 py-0 align-baseline text-[0.85em] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
        title={props.inlineContent.props.userIri}
      >
        @{props.inlineContent.props.name || 'Unbekannt'}
      </span>
    ),
  },
);

/**
 * Single shared schema used by the editor and any preview component.
 * Extending defaultInlineContentSpecs preserves the built-ins (text, link,
 * etc.); we just add `mention` on top.
 */
export const documentSchema = BlockNoteSchema.create({
  blockSpecs: defaultBlockSpecs,
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    mention: Mention,
    linkcard: LinkCard,
  },
});
