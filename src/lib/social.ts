import type { HydraItemBaseSchema } from '@/api/types/HydraItemBaseSchema.ts';
import { api } from '@/lib/api';

/**
 * Social-posting domain types + helpers.
 *
 * These types are hand-authored (not kubb-generated) on purpose: the
 * `pnpm gen:api` codegen is currently broken on Node 24 ("null byte is not
 * allowed in input"), so the SocialPost/SocialPostTarget shapes aren't in
 * `src/api/types` yet. They mirror the backend `#[ApiResource]` exactly
 * (see src/Entity/SocialPost.php + SocialPostTarget.php). Once gen:api is
 * fixed, switch the imports to `@/api/types/socialPost/Jsonld` and delete the
 * type aliases below — the network metadata + action helpers stay here.
 */

export type SocialPostStatus =
  | 'draft'
  | 'pending_approval'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'partially_failed'
  | 'failed'
  | 'canceled';

export type SocialPostTargetStatus =
  | 'queued'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped';

/** One uploaded-media reference attached to a post. */
export type SocialMediaRef = {
  fileId: string;
  fileIri?: string;
  mimeType?: string;
  sizeBytes?: number;
  altText?: string;
};

export type SocialPostJsonld = HydraItemBaseSchema & {
  id?: string | null;
  body: string;
  mediaRefs?: SocialMediaRef[];
  /** Read-only: owned by the submit/approve/publish lifecycle. */
  status?: SocialPostStatus;
  scheduledAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  /** IRI references to the post's SocialPostTarget rows. */
  targets?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type SocialPostTargetJsonld = HydraItemBaseSchema & {
  id?: string | null;
  socialPost?: string;
  /** IRI of the social_* Channel this target publishes to. */
  channel?: string;
  bodyOverride?: string | null;
  status?: SocialPostTargetStatus;
  externalId?: string | null;
  permalink?: string | null;
  errorReason?: string | null;
  attemptCount?: number;
  publishedAt?: string | null;
};

/**
 * Per-network presentation + composing constraints. `adapterCode` is the
 * Channel's `adapterCode` (social_*). `charLimit` is a client-side hint for
 * the live counter; the authoritative limit comes back from the /preview
 * endpoint, which we always honour for the final validity check.
 */
export type NetworkMeta = {
  adapterCode: string;
  label: string;
  /** Two-letter avatar initials. */
  short: string;
  /** Tailwind classes for the network avatar chip. */
  accent: string;
  charLimit: number;
};

export const NETWORKS: Record<string, NetworkMeta> = {
  social_mastodon: {
    adapterCode: 'social_mastodon',
    label: 'Mastodon',
    short: 'Ma',
    accent: 'bg-[#6364FF] text-white',
    charLimit: 500,
  },
  social_bluesky: {
    adapterCode: 'social_bluesky',
    label: 'Bluesky',
    short: 'Bs',
    accent: 'bg-[#0085FF] text-white',
    charLimit: 300,
  },
  social_linkedin: {
    adapterCode: 'social_linkedin',
    label: 'LinkedIn',
    short: 'In',
    accent: 'bg-[#0A66C2] text-white',
    charLimit: 3000,
  },
  social_facebook: {
    adapterCode: 'social_facebook',
    label: 'Facebook',
    short: 'Fb',
    accent: 'bg-[#1877F2] text-white',
    charLimit: 63206,
  },
  social_instagram: {
    adapterCode: 'social_instagram',
    label: 'Instagram',
    short: 'Ig',
    accent: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
    charLimit: 2200,
  },
};

export function networkFor(adapterCode: string | undefined | null): NetworkMeta {
  return (
    (adapterCode && NETWORKS[adapterCode]) || {
      adapterCode: adapterCode ?? 'unknown',
      label: adapterCode ?? 'Unbekannt',
      short: (adapterCode ?? '?').slice(0, 2),
      accent: 'bg-muted text-foreground',
      charLimit: 1000,
    }
  );
}

export function isSocialAdapter(adapterCode: string | undefined | null): boolean {
  return !!adapterCode && adapterCode.startsWith('social_');
}

export const POST_STATUS_BADGE: Record<
  SocialPostStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  draft: { label: 'social.post_status.draft', variant: 'outline' },
  pending_approval: { label: 'social.post_status.pending_approval', variant: 'secondary' },
  scheduled: { label: 'social.post_status.scheduled', variant: 'secondary' },
  publishing: { label: 'social.post_status.publishing', variant: 'secondary' },
  published: { label: 'social.post_status.published', variant: 'default' },
  partially_failed: { label: 'social.post_status.partially_failed', variant: 'destructive' },
  failed: { label: 'social.post_status.failed', variant: 'destructive' },
  canceled: { label: 'social.post_status.canceled', variant: 'outline' },
};

export const TARGET_STATUS_BADGE: Record<
  SocialPostTargetStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  queued: { label: 'social.target_status.queued', variant: 'outline' },
  publishing: { label: 'social.target_status.publishing', variant: 'secondary' },
  published: { label: 'social.target_status.published', variant: 'default' },
  failed: { label: 'social.target_status.failed', variant: 'destructive' },
  skipped: { label: 'social.target_status.skipped', variant: 'outline' },
};

/** A single AI text suggestion for one network. */
export type AiSuggestion = {
  adapterCode: string;
  network: string;
  suggestion: string;
  length: number;
  maxLength: number;
};

/** One per-target row of the /preview response. */
export type PreviewTarget = {
  targetId?: string;
  channelId?: string;
  adapterCode?: string;
  network?: string;
  text?: string;
  length?: number;
  maxLength?: number;
  problems?: string[];
  valid?: boolean;
};

export type PreviewResult = {
  valid?: boolean;
  targets?: PreviewTarget[];
};

/**
 * Lifecycle + helper calls that aren't plain CRUD. They hit the custom
 * controllers on the backend (all POST). Kept here so the pages don't
 * re-derive the URL shapes.
 */
export const socialActions = {
  submit: (id: string) => api.post(`/social_posts/${id}/submit`).then((r) => r.data),
  approve: (id: string) => api.post(`/social_posts/${id}/approve`).then((r) => r.data),
  cancel: (id: string) => api.post(`/social_posts/${id}/cancel`).then((r) => r.data),
  publish: (id: string) => api.post(`/social_posts/${id}/publish`).then((r) => r.data),
  schedule: (id: string, scheduledAt: string | null) =>
    api.post(`/social_posts/${id}/schedule`, { scheduledAt }).then((r) => r.data),
  preview: (id: string) =>
    api.post<PreviewResult>(`/social_posts/${id}/preview`).then((r) => r.data),
  aiSuggest: (id: string, opts: { network?: string; tone?: string } = {}) =>
    api
      .post<{ suggestions: AiSuggestion[] }>(`/social_posts/${id}/ai-suggest`, opts)
      .then((r) => r.data.suggestions ?? []),
  retryTarget: (targetId: string) =>
    api.post(`/social_post_targets/${targetId}/retry`).then((r) => r.data),
};
