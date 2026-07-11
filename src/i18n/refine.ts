import type { I18nProvider } from '@refinedev/core';

import i18n from './index';

/**
 * Refine i18nProvider backed by the shared i18next instance, so Refine's own
 * chrome (buttons, table empties, notifications) translates alongside our
 * `t()` calls. `translate(key, options, defaultMessage)` maps to i18next's `t`.
 */
export const i18nProvider: I18nProvider = {
  translate: (key: string, options?: unknown, defaultMessage?: string): string =>
    i18n.t(key, {
      defaultValue: defaultMessage,
      ...(typeof options === 'object' && options !== null ? (options as Record<string, unknown>) : {}),
    }),
  changeLocale: (lang: string) => i18n.changeLanguage(lang),
  getLocale: () => i18n.language,
};
