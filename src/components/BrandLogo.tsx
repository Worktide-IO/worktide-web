import { useState } from 'react';

import { useBranding } from '@/providers/BrandingProvider';
import { FALLBACK_LOGO, logoFor } from '@/lib/branding';

/**
 * Renders the instance logo (BRAND_LOGO_URL or the backend's /branding/logo),
 * falling back to the bundled Worktide lockup if the configured URL fails to
 * load — so a misconfigured or unreachable logo URL never leaves a broken image.
 */
export function BrandLogo({ className }: { className?: string }) {
  const branding = useBranding();
  const [errored, setErrored] = useState(false);

  const src = errored ? FALLBACK_LOGO : logoFor(branding);

  return (
    <img
      src={src}
      alt={branding.name}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
