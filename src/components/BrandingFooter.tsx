import { useBranding } from '@/providers/BrandingProvider';

/**
 * Legal footer with Impressum / Datenschutz links. Each link renders only when
 * the corresponding BRAND_*_URL is configured; if neither is set the whole
 * footer collapses to nothing.
 */
export function BrandingFooter({ className }: { className?: string }) {
  const { imprintUrl, privacyUrl } = useBranding();

  if (!imprintUrl && !privacyUrl) return null;

  return (
    <footer
      className={`flex items-center justify-center gap-3 text-xs text-muted-foreground ${className ?? ''}`}
    >
      {imprintUrl && (
        <a href={imprintUrl} target="_blank" rel="noreferrer" className="hover:underline">
          Impressum
        </a>
      )}
      {imprintUrl && privacyUrl && <span aria-hidden="true">&middot;</span>}
      {privacyUrl && (
        <a href={privacyUrl} target="_blank" rel="noreferrer" className="hover:underline">
          Datenschutz
        </a>
      )}
    </footer>
  );
}
