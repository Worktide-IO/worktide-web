/**
 * Compact "time ago" formatter — picks the largest unit that gives a
 * meaningful number ("just now", "2 min ago", "3 h ago", "5 days ago", …).
 *
 * Intl.RelativeTimeFormat exists but adds chatter ("2 hours ago") that's too
 * long for badges; this returns short forms from the i18n catalog (time.*)
 * instead. Reads i18n at call time (used in render), so it follows the active
 * language.
 */
import i18n from '@/i18n';

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  const t = i18n.t.bind(i18n);

  if (seconds < 45) return t('time.just_now');
  if (seconds < 90) return t('time.min', { count: 1 });
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return t('time.min', { count: minutes });
  if (minutes < 90) return t('time.hour', { count: 1 });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('time.hour', { count: hours });
  if (hours < 36) return t('time.yesterday');
  const days = Math.round(hours / 24);
  if (days < 14) return t('time.day', { count: days });
  const weeks = Math.round(days / 7);
  if (weeks < 8) return t('time.week', { count: weeks });
  const months = Math.round(days / 30);
  if (months < 18) return t('time.month', { count: months });
  const years = Math.round(days / 365);
  return t('time.year', { count: years });
}
