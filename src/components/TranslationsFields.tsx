import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { languageLabel, type TranslationsMap } from '@/lib/languages';

export type { TranslationsMap };

/**
 * Reusable per-locale editor for an entity's translatable text fields.
 *
 * Backend entities carry a single `translations` JSON column
 * (`{field:{locale:value}}`); the base column (e.g. name) stays the source
 * value. This renders one input per (locale × field); leaving one blank drops
 * that override so the base value is served. Empty maps collapse to `{}` — the
 * backend trait normalises that to NULL.
 *
 * Drop it into any entity dialog: pass the translatable fields, the supported
 * locales, and wire value/onChange into the same state you PATCH/POST.
 */
export function TranslationsFields({
  fields,
  locales,
  value,
  onChange,
}: {
  fields: { key: string; label: string }[];
  locales: string[];
  value: TranslationsMap;
  onChange: (next: TranslationsMap) => void;
}) {
  if (locales.length === 0 || fields.length === 0) return null;

  const set = (field: string, locale: string, raw: string) => {
    const next: TranslationsMap = { ...value, [field]: { ...(value[field] ?? {}) } };
    if (raw.trim() === '') {
      delete next[field][locale];
    } else {
      next[field][locale] = raw;
    }
    if (Object.keys(next[field]).length === 0) {
      delete next[field];
    }
    onChange(next);
  };

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <p className="text-xs font-medium text-muted-foreground">Übersetzungen</p>
      {locales.map((locale) => (
        <div key={locale} className="space-y-2">
          <p className="text-xs font-semibold">{languageLabel(locale)}</p>
          {fields.map((field) => (
            <div key={field.key} className="space-y-1">
              <Label className="text-xs text-muted-foreground" htmlFor={`i18n-${field.key}-${locale}`}>
                {field.label}
              </Label>
              <Input
                id={`i18n-${field.key}-${locale}`}
                value={value[field.key]?.[locale] ?? ''}
                onChange={(e) => set(field.key, locale, e.target.value)}
              />
            </div>
          ))}
        </div>
      ))}
      <p className="text-[11px] text-muted-foreground">
        Leer lassen = Standardwert (oben) verwenden.
      </p>
    </div>
  );
}
