import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import {
  applyBranding,
  fetchBranding,
  readCachedBranding,
  type Branding,
} from '@/lib/branding';

const BrandingContext = createContext<Branding>(readCachedBranding());

/**
 * Provides white-label branding app-wide. Seeds from the localStorage cache
 * (flash-free), then revalidates against GET /v1/branding and re-applies the
 * CSS variables / title. The endpoint is public, so this works on the login
 * and setup pages before authentication.
 */
export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(readCachedBranding);

  useEffect(() => {
    let cancelled = false;
    fetchBranding()
      .then((b) => {
        if (cancelled) return;
        setBranding(b);
        applyBranding(b);
      })
      .catch(() => {
        /* keep cached/default branding on failure */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <BrandingContext.Provider value={branding}>{children}</BrandingContext.Provider>;
}

/** Access the current branding (logo, name, colors, legal links). */
export function useBranding(): Branding {
  return useContext(BrandingContext);
}
