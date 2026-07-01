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

export type AiTriageTarget = 'task' | 'conversation';

/** The validated proposal the agent produced. Shape depends on the target. */
export type AiSuggestion = {
  summary?: string;
  // Task-shaped
  tracker?: string | null;
  priority?: string | null;
  tags?: string[];
  suggestedNewTags?: string[];
  // Conversation-shaped
  status?: string | null;
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

  /**
   * The newest still-pending recommendation for a ticket, or null.
   *
   * Filtered client-side: API-Platform's SearchFilter does not match the
   * native-enum `status` nor the binary `uuid` `targetId` columns, so we fetch
   * the workspace's newest recommendations (auto-scoped server-side) and match
   * target + targetId + status here. Pending recommendations are rare (they get
   * accepted/rejected/superseded), so the recent window is sufficient.
   */
  fetchPending: async (target: AiTriageTarget, targetId: string): Promise<AiRecommendation | null> => {
    const { data } = await api.get('/ai_recommendations', {
      params: {
        'order[createdAt]': 'desc',
        itemsPerPage: 50,
      },
    });
    const members: AiRecommendation[] =
      (data as Record<string, unknown>)['hydra:member'] as AiRecommendation[] ??
      (data as Record<string, unknown>).member as AiRecommendation[] ??
      [];
    return (
      members.find(
        (m) => m.status === 'pending' && m.target === target && m.targetId === targetId,
      ) ?? null
    );
  },

  /** Apply the suggestion to the ticket. */
  accept: (id: string): Promise<unknown> =>
    api.post(`/ai_recommendations/${id}/accept`).then((r) => r.data),

  /** Dismiss the suggestion. */
  reject: (id: string): Promise<unknown> =>
    api.post(`/ai_recommendations/${id}/reject`).then((r) => r.data),
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
