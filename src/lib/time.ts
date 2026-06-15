/**
 * Compact German "time ago" formatter — picks the largest unit that
 * gives a meaningful number ("gerade eben", "vor 2 min", "vor 3 h",
 * "vor 5 Tagen", "vor 2 Wo", "vor 3 Mon", "vor 1 J").
 *
 * Intl.RelativeTimeFormat exists but adds chatter ("vor 2 Stunden")
 * that's too long for badges; this returns short forms instead.
 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));

  if (seconds < 45) return 'gerade eben';
  if (seconds < 90) return 'vor 1 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return `vor ${minutes} min`;
  if (minutes < 90) return 'vor 1 h';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} h`;
  if (hours < 36) return 'gestern';
  const days = Math.round(hours / 24);
  if (days < 14) return `vor ${days} Tagen`;
  const weeks = Math.round(days / 7);
  if (weeks < 8) return `vor ${weeks} Wo`;
  const months = Math.round(days / 30);
  if (months < 18) return `vor ${months} Mon`;
  const years = Math.round(days / 365);
  return `vor ${years} J`;
}
