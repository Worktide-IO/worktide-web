import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import de from '@/locales/de.json';
import en from '@/locales/en.json';

/**
 * App i18n runtime (i18next + react-i18next). English is the source/fallback
 * language; German is a translation. The active language is set at runtime from
 * the user's stored preference (see LocaleSync in App.tsx / useActiveLocale) —
 * we init to 'en' and change it once the profile resolves.
 *
 * Keys are semantic (e.g. `action.save`), added per phase — see the backend
 * docs/i18n-plan.md. Bulk string extraction is Phase 1+.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
  },
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: ['en', 'de'],
  // Semantic keys are flat, dotted strings (e.g. `nav.wall`, `action.save`) —
  // treat the whole key literally instead of nesting on `.`.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false }, // React already escapes
  returnEmptyString: false,
});

export default i18n;
