import { api } from '@/lib/api';

/**
 * Client for the shared feedback board (`/v1/feedback`). Curated custom
 * endpoints (not an API-Platform resource), called directly through the shared
 * axios instance like {@link notifications}. Responses are already anonymized
 * server-side — DTOs only ever carry role-label keys, never identities (except
 * the `submitter` field, which the backend only sets for super-admins).
 */

export type FeedbackCategory = {
  key: string; // 'bug' | 'feature' | 'ui_ux' | 'other'
  label: string | null;
  icon: string | null;
  color: string | null;
};

export type FeedbackStatus = {
  key: string; // 'new' | 'triaged' | 'planned' | 'in_progress' | 'done' | 'declined'
  label: string;
  isCompleted: boolean;
};

export type FeedbackTicket = {
  id: string;
  identifier: string | null;
  title: string;
  description?: string | null;
  category: FeedbackCategory;
  status: FeedbackStatus;
  authorLabel: string; // 'you' | 'team' | 'reporter' | 'user'
  isMine: boolean;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  // Worktide-team-only (platform admins): who filed it + captured context.
  submitter?: { name: string | null; workspace: string | null; sourceApp: string | null; route: string | null };
  diagnostics?: unknown;
  hasScreenshot?: boolean;
};

/** authorLabel is a role key for normal viewers, or `{name}` for super-admins. */
export type FeedbackAuthorLabel = string | { name: string | null };

export type FeedbackReply = {
  id: string;
  authorLabel: FeedbackAuthorLabel;
  content: string;
  createdAt: string;
};

export type FeedbackDetail = { ticket: FeedbackTicket; replies: FeedbackReply[] };

export type FeedbackSubmitInput = {
  title: string;
  category: string;
  description?: string;
  route?: string;
  appVersion?: string;
  diagnostics?: unknown;
};

export const feedbackApi = {
  list: (params: { category?: string; status?: string } = {}) =>
    api.get<{ items: FeedbackTicket[] }>('/feedback', { params }).then((r) => r.data.items),

  get: (id: string) => api.get<FeedbackDetail>(`/feedback/${id}`).then((r) => r.data),

  submit: (input: FeedbackSubmitInput) =>
    api.post<FeedbackTicket>('/feedback', input).then((r) => r.data),

  reply: (id: string, content: string) =>
    api.post<FeedbackReply>(`/feedback/${id}/replies`, { content }).then((r) => r.data),

  uploadScreenshot: (id: string, blob: Blob) => {
    const fd = new FormData();
    fd.append('file', blob, 'screenshot.png');
    return api.post(`/feedback/${id}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Fetch the admin-only screenshot as an object URL (Worktide team only). */
  screenshotObjectUrl: (id: string) =>
    api.get(`/feedback/${id}/screenshot`, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data as Blob)),
};
