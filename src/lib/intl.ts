/**
 * Locale-aware Intl formatting. Everything routes through the app's active
 * language (i18n.language: 'de' | 'en') so dates, times, and numbers follow
 * the user's chosen language instead of a hard-coded 'de-DE' or the browser
 * locale.
 *
 * These read `i18n.language` at call time (not via a hook), so call them in
 * render — the surrounding component re-renders on a language switch because
 * it also uses `useTranslation()` for its text. Module-level formatters that
 * cache the locale must NOT be built at import time (the language isn't
 * resolved yet); build them per call via these helpers instead.
 */
import i18n from '@/i18n';

// App language → BCP-47 locale. English uses en-GB (day/month/year) rather
// than US ordering, matching a European product.
const INTL_LOCALE: Record<string, string> = { de: 'de-DE', en: 'en-GB' };

/** BCP-47 locale string for the active app language, for Intl.* APIs. */
export function intlLocale(): string {
  return INTL_LOCALE[i18n.language] ?? i18n.language ?? 'en-GB';
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Date only, active locale. Empty/invalid → em dash. */
export function formatDate(
  value: string | number | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(intlLocale(), opts) : '—';
}

/** Date + time, active locale. Empty/invalid → em dash. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const d = toDate(value);
  return d ? d.toLocaleString(intlLocale(), opts) : '—';
}

/** Plain number, active locale. */
export function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(intlLocale(), opts).format(value);
}
