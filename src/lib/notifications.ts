import { api } from '@/lib/api';

/**
 * Client for the staff notification inbox (`/v1/me/notifications`). These are
 * plain custom endpoints (not an API-Platform resource), so we call them
 * directly through the shared axios instance rather than via Refine's data
 * provider. The JWT + workspace header are stamped by the api interceptor.
 */

export type NotificationType =
  | 'mention'
  | 'task_assigned'
  | 'comment'
  | 'system'
  | 'ai'
  | 'launch';

export type Notification = {
  id: string;
  type: NotificationType | string;
  title: string;
  body: string | null;
  link: string;
  occurredAt: string;
  read: boolean;
  readAt?: string | null;
};

export type NotificationFeed = {
  items: Notification[];
  unreadCount: number;
  nextCursor: string | null;
};

/** Mercure topic the backend publishes each new notification to (per user). */
export function notificationsTopic(userId: string): string {
  return `/v1/users/${userId}/notifications`;
}

export const notificationsApi = {
  list: (params: { cursor?: string | null; limit?: number; unread?: boolean } = {}) =>
    api
      .get<NotificationFeed>('/me/notifications', {
        params: {
          ...(params.cursor ? { cursor: params.cursor } : {}),
          ...(params.limit ? { limit: params.limit } : {}),
          ...(params.unread ? { unread: 1 } : {}),
        },
      })
      .then((r) => r.data),

  markRead: (id: string) =>
    api.post<{ unreadCount: number }>(`/me/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    api.post<{ unreadCount: number }>('/me/notifications/read-all').then((r) => r.data),
};
