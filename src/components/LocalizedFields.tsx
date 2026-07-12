import type { KeyboardEvent } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { languageLabel, usePrimaryLocale, type TranslationsMap } from '@/lib/languages';

export type { TranslationsMap };

/** Sentinel dropdown value for "edit the base (source-language) columns". */
const BASE = '__base__';

export type LocalizedField = {
  key: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

/**
 * Translatable text fields with a **language dropdown** (replaces the old stacked
 * `TranslationsFields`). One group of inputs edits the base columns *or* a
 * per-locale override, depending on the selected language:
 *
 *  - "<Primary> (Standard)" → edits the base value (`base` / `onBaseChange`);
 *  - any other supported locale → edits `translations[field][locale]`
 *    (`onTranslationsChange`), with the base value shown as the placeholder.
 *
 * The dropdown scopes ONLY these fields — non-translatable inputs (slug,
 * duration, …) stay in the surrounding form and always edit the base. If the
 * deployment has no locale beyond the primary, the switcher is hidden and this
 * behaves like a plain base-field group.
 */
export function LocalizedFields({
  fields,
  locales,
  base,
  onBaseChange,
  translations,
  onTranslationsChange,
  onBaseBlur,
  onBaseKeyDown,
}: {
  fields: LocalizedField[];
  locales: string[];
  base: Record<string, string>;
  onBaseChange: (key: string, value: string) => void;
  translations: TranslationsMap;
  onTranslationsChange: (next: TranslationsMap) => void;
  onBaseBlur?: (key: string, value: string) => void;
  onBaseKeyDown?: (key: string, e: KeyboardEvent) => void;
}) {
  const { t } = useTranslation();
  // The workspace's own language authors the base columns; the other supported
  // locales are the ones you can add overrides for.
  const primary = usePrimaryLocale();
  const others = locales.filter((l) => l && l !== primary);
  const [lang, setLang] = useState<string>(BASE);

  // If the chosen override locale is no longer offered, fall back to base.
  useEffect(() => {
    if (lang !== BASE && !others.includes(lang)) setLang(BASE);
  }, [lang, others]);

  if (fields.length === 0) return null;

  const editingBase = lang === BASE;

  const setOverride = (key: string, locale: string, raw: string) => {
    const next: TranslationsMap = { ...translations, [key]: { ...(translations[key] ?? {}) } };
    if (raw.trim() === '') {
      delete next[key][locale];
    } else {
      next[key][locale] = raw;
    }
    if (Object.keys(next[key]).length === 0) {
      delete next[key];
    }
    onTranslationsChange(next);
  };

  const baseOptionLabel = primary
    ? `${languageLabel(primary)} (${t('localized_fields.standard')})`
    : t('localized_fields.standard');

  return (
    <div className="space-y-3">
      {others.length > 0 ? (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">{t('localized_fields.language')}</Label>
          <Select value={lang} onValueChange={setLang}>
            <SelectTrigger className="h-8 w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={BASE}>{baseOptionLabel}</SelectItem>
              {others.map((l) => (
                <SelectItem key={l} value={l}>
                  {languageLabel(l)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {fields.map((f) => {
        const id = `lf-${f.key}-${lang}`;
        const value = editingBase ? (base[f.key] ?? '') : (translations[f.key]?.[lang] ?? '');
        // On an override locale, show the base value as the placeholder so a
        // blank field visibly falls back to it.
        const placeholder = editingBase ? f.placeholder : (base[f.key] || f.placeholder);
        const onChange = (raw: string) =>
          editingBase ? onBaseChange(f.key, raw) : setOverride(f.key, lang, raw);
        const onBlur = editingBase && onBaseBlur ? (raw: string) => onBaseBlur(f.key, raw) : undefined;
        const onKeyDown =
          editingBase && onBaseKeyDown ? (e: KeyboardEvent) => onBaseKeyDown(f.key, e) : undefined;

        return (
          <div key={f.key} className="space-y-1">
            <Label htmlFor={id} className="text-xs text-muted-foreground">
              {f.label}
              {!editingBase ? ` · ${languageLabel(lang)}` : ''}
            </Label>
            {f.multiline ? (
              <Textarea
                id={id}
                rows={2}
                value={value}
                placeholder={placeholder}
                autoFocus={f.autoFocus}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
                onKeyDown={onKeyDown}
              />
            ) : (
              <Input
                id={id}
                value={value}
                placeholder={placeholder}
                autoFocus={f.autoFocus}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
                onKeyDown={onKeyDown}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
