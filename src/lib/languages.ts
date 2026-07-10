import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

/**
 * Human labels for the locale codes the backend advertises. Unknown codes
 * fall back to the raw code, so enabling a locale server-side (via
 * `app.supported_locales`) needs no change here.
 */
export const LANGUAGE_LABELS: Record<string, string> = {
  de: 'Deutsch',
  en: 'English',
};

export function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code;
}

/** `{ field: { locale: value } }` — mirrors the backend `translations` column. */
export type TranslationsMap = Record<string, Record<string, string>>;

type I18nProfile = { supportedLanguages: string[]; preferredLanguage: string | null };

// Small + static per deployment, so fetch the i18n bits of the profile once and
// cache process-wide. Every translation editor + the active-locale hook share it.
let cache: I18nProfile | null = null;
let inflight: Promise<I18nProfile> | null = null;

async function fetchI18nProfile(): Promise<I18nProfile> {
  if (cache) return cache;
  if (!inflight) {
    inflight = api
      .get<{ supportedLanguages?: string[]; preferredLanguage?: string | null }>('/me/profile')
      .then(({ data }) => {
        cache = {
          supportedLanguages: data.supportedLanguages ?? ['en'],
          preferredLanguage: data.preferredLanguage ?? null,
        };
        return cache;
      })
      .catch(() => {
        cache = { supportedLanguages: ['en'], preferredLanguage: null };
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Invalidate the cache after the user changes their profile language. */
export function resetI18nProfileCache(): void {
  cache = null;
}

/**
 * Supported display locales for the active deployment. Cached after the first
 * call, so mounting several translation editors triggers a single request.
 */
export function useSupportedLanguages(): { languages: string[]; loading: boolean } {
  const [languages, setLanguages] = useState<string[]>(cache?.supportedLanguages ?? []);
  const [loading, setLoading] = useState<boolean>(cache === null);

  useEffect(() => {
    let cancelled = false;
    void fetchI18nProfile().then((p) => {
      if (!cancelled) {
        setLanguages(p.supportedLanguages);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { languages, loading };
}

/**
 * The locale the current user should see translatable content in:
 * their preferred language, else the first supported locale (the deployment's
 * primary), else 'en'. Missing translations always fall back to the base value
 * in {@link localize}, so an imperfect guess never blanks content.
 */
export function useActiveLocale(): string {
  const [locale, setLocale] = useState<string | null>(
    cache ? (cache.preferredLanguage ?? cache.supportedLanguages[0] ?? 'en') : null,
  );

  useEffect(() => {
    let cancelled = false;
    void fetchI18nProfile().then((p) => {
      if (!cancelled) setLocale(p.preferredLanguage ?? p.supportedLanguages[0] ?? 'en');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return locale ?? 'en';
}

/**
 * Resolve a translatable field for a given locale: the per-locale override if
 * present + non-empty, otherwise the raw base value (source language). The
 * backend serves the base field untouched, so this never returns empty for a
 * populated field.
 */
export function localize(
  entity: { translations?: TranslationsMap | null } & Record<string, unknown>,
  field: string,
  locale: string,
): string {
  const override = entity.translations?.[field]?.[locale];
  if (typeof override === 'string' && override.trim() !== '') {
    return override;
  }
  const base = entity[field];
  return typeof base === 'string' ? base : '';
}

/** Hook form of {@link localize} bound to the current user's active locale. */
export function useLocalize(): (
  entity: { translations?: TranslationsMap | null } & Record<string, unknown>,
  field: string,
) => string {
  const locale = useActiveLocale();
  return (entity, field) => localize(entity, field, locale);
}
