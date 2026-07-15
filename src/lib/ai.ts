import { api } from '@/lib/api';

/**
 * Client for the AI ticket-triage feature (backend Phase D).
 *
 * The triage endpoints are plain Symfony route controllers (not part of the
 * generated API-Platform client), so they're called via the raw axios instance
 * — same idiom as `src/lib/social.ts`. The AIRecommendation read-resource IS an
 * API-Platform resource; we type only the slice we render here rather than
 * pulling the full generated type, so the panel stays decoupled from `gen:api`.
 */

export type AiTriageTarget = 'task' | 'conversation' | 'product' | 'customer' | 'workspace';

/** One per-network marketing post variant the agent drafted for a product. */
export type AiSocialVariant = {
  adapterCode: string;
  network?: string;
  body: string;
};

/** The validated proposal the agent produced. Shape depends on the target. */
export type AiSuggestion = {
  summary?: string;
  // Task-shaped
  tracker?: string | null;
  priority?: string | null;
  tags?: string[];
  suggestedNewTags?: string[];
  // Conversation-shaped (triage)
  status?: string | null;
  // Task-shaped (effort estimate)
  estimatedMinutes?: number | null;
  sampleSize?: number;
  // Ticket-from-conversation-shaped
  title?: string;
  shouldCreateTicket?: boolean;
  suggestedProject?: string | null; // project uuid, or null when none could be inferred
  // Product-shaped (marketing social draft)
  variants?: AiSocialVariant[];
  // Customer-shaped (upgrade outreach email)
  subject?: string;
  body?: string;
  outdatedProducts?: { product: string; currentVersion: string; latestVersion: string }[];
  // Workspace-shaped (proactive research suggestion)
  prompt?: string;
  objective?: string;
  rationale?: string;
  targetCount?: number | null;
  // Workspace-shaped (generic agent action)
  archetype?: string;
  connectorCode?: string;
  channelId?: string;
  payload?: { body?: string; recipient?: string; subject?: string };
};

export type AiRecommendation = {
  '@id': string;
  id: string;
  target: AiTriageTarget;
  targetId: string;
  kind: string;
  status: 'pending' | 'accepted' | 'rejected' | 'superseded';
  suggestion: AiSuggestion;
  reasoning?: string | null;
  model?: string | null;
};

const segment = (t: AiTriageTarget): string => (t === 'task' ? 'tasks' : 'conversations');

export const aiTriage = {
  /** Queue an on-demand triage run for a ticket (202 Accepted). */
  request: (target: AiTriageTarget, targetId: string): Promise<unknown> =>
    api.post(`/${segment(target)}/${targetId}/ai-triage`).then((r) => r.data),

  /** Queue an on-demand "create ticket?" suggestion for a conversation (202). */
  suggestTicket: (conversationId: string): Promise<unknown> =>
    api.post(`/conversations/${conversationId}/suggest-ticket`).then((r) => r.data),

  /**
   * The newest still-pending recommendation for a target, optionally narrowed to
   * a kind (e.g. 'triage' vs 'ticket_from_conversation' so the two panels don't
   * pick up each other's suggestions).
   */
  fetchPending: async (
    target: AiTriageTarget,
    targetId: string,
    kind?: string,
  ): Promise<AiRecommendation | null> => {
    const { data } = await api.get('/ai_recommendations', {
      params: {
        target,
        targetId,
        status: 'pending',
        ...(kind ? { kind } : {}),
        'order[createdAt]': 'desc',
        itemsPerPage: 1,
      },
    });
    const members: AiRecommendation[] =
      (data as Record<string, unknown>)['hydra:member'] as AiRecommendation[] ??
      (data as Record<string, unknown>).member as AiRecommendation[] ??
      [];
    return members[0] ?? null;
  },

  /**
   * Apply the suggestion. For ticket-from-conversation an optional project
   * (IRI or uuid) is sent; the server 409s if none is supplied and none was
   * suggested.
   */
  accept: (id: string, project?: string): Promise<unknown> =>
    api
      .post(`/ai_recommendations/${id}/accept`, project ? { project } : {})
      .then((r) => r.data),

  /** Dismiss the suggestion. */
  reject: (id: string): Promise<unknown> =>
    api.post(`/ai_recommendations/${id}/reject`).then((r) => r.data),
};

/**
 * Effort-estimation agent (Phase D, layer 2): suggests a task's estimatedMinutes
 * from similar completed tasks' actual logged time. Reuse aiTriage.fetchPending
 * / accept / reject with kind 'estimate' — only the trigger endpoint differs.
 */
export const aiEstimate = {
  /** Queue an on-demand effort estimate for a task (202 Accepted). */
  request: (taskId: string): Promise<unknown> =>
    api.post(`/tasks/${taskId}/ai-estimate`).then((r) => r.data),
};

/**
 * Reply-suggestion agent (Phase D, layer 4): drafts a reply to a conversation
 * using the workspace's Saved Replies as few-shot tone examples. Synchronous +
 * inline like aiTags — returns the draft text; nothing is persisted or sent, the
 * composer just pre-fills it for the agent to edit and send.
 */
export const aiReply = {
  suggest: (conversationId: string): Promise<{ reply: string; model?: string | null }> =>
    api.post(`/conversations/${conversationId}/suggest-reply`).then((r) => r.data as { reply: string; model?: string | null }),
};

/** Marketing-agent triggers (human-in-the-loop): drafts, never auto-publishes. */
export const aiMarketing = {
  /**
   * Queue a marketing social-copy draft for a product (202 Accepted). The worker
   * produces a Pending recommendation; accepting it materialises a Draft social
   * post that still goes through the normal approval gate.
   */
  request: (productId: string): Promise<unknown> =>
    api.post(`/products/${productId}/ai-marketing-draft`).then((r) => r.data),
};

/** Customer-success agent: draft an upgrade/upsell outreach email (never auto-sends). */
export const aiOutreach = {
  /**
   * Queue an upgrade-outreach draft for a customer (202 Accepted). Accepting the
   * resulting recommendation materialises an OutboundMessage; the default-deny
   * `email_outbound` egress gate is what holds actual sending back.
   */
  request: (customerId: string): Promise<unknown> =>
    api.post(`/customers/${customerId}/ai-upgrade-outreach`).then((r) => r.data),
};

/**
 * Generic agent: works out how to distribute a piece of content across the
 * workspace's connected channels (incl. forums). The worker writes one pending
 * agent-action recommendation per channel; accepting one materialises the normal
 * egress-gated draft. `workspace` is the current workspace uuid (or IRI).
 */
export const aiAgent = {
  planDistribution: (content: string, workspace: string): Promise<unknown> =>
    api.post('/agent/plan-distribution', { content, workspace }).then((r) => r.data),
};

/** One existing tag the agent picked (resolved to its IRI so it can be attached directly). */
export type SuggestedTag = { id: string; iri: string; name: string; color: string };

export type TagSuggestionResult = {
  tags: SuggestedTag[];
  suggestedNewTags: string[];
  reasoning?: string | null;
  model?: string | null;
};

/** Either an existing record (server builds the context) or an unsaved draft. */
export type TagSuggestionInput =
  | { resource: string }
  | { target: string; text: string; workspace: string };

/**
 * On-demand tag suggestions for any taggable record. Like the triage endpoints
 * this is a plain Symfony controller (not in the generated client) — it runs the
 * LLM synchronously and returns the proposal inline. Nothing is applied server
 * side; the caller attaches chosen tags via the normal `tags` IRI field.
 */
export const aiTags = {
  suggest: (input: TagSuggestionInput): Promise<TagSuggestionResult> =>
    api.post('/ai/suggest-tags', input).then((r) => r.data as TagSuggestionResult),
};

/** Best-effort extraction of a human-readable error from an axios failure. */
export function aiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (data) {
    const detail = data.detail ?? data['hydra:description'] ?? data['hydra:title'];
    if (typeof detail === 'string' && detail.trim() !== '') {
      return detail;
    }
  }
  return fallback;
}
