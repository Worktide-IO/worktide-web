import { API_BASE } from '@/lib/api';

/**
 * White-label branding, fetched at runtime from the backend's public
 * GET /v1/branding endpoint. The backend is the single source of truth
 * (driven by BRAND_* env), so an operator rebrands the whole stack —
 * emails + this SPA + the customer portal — without any frontend rebuild.
 *
 * Colors are applied by overriding the shadcn `--primary` family of CSS
 * variables on :root; the logo, name and legal links are read via
 * useBranding() where components need them.
 */
export type Branding = {
  name: string;
  legalName: string;
  logoUrl: string;
  logoUrlDark: string;
  primaryColor: string;
  accentColor: string;
  imprintUrl: string;
  privacyUrl: string;
  supportEmail: string;
};

/** Stock Worktide look — used before the fetch resolves and as a fallback. */
export const DEFAULT_BRANDING: Branding = {
  name: 'Worktide',
  legalName: 'Worktide',
  logoUrl: '',
  logoUrlDark: '',
  primaryColor: '#0F8C72',
  accentColor: '#E0623A',
  imprintUrl: '',
  privacyUrl: '',
  supportEmail: '',
};

/** Bundled logo shipped with the SPA; used when the backend gives no usable URL. */
export const FALLBACK_LOGO = '/brand/logo/worktide-lockup.svg';
export const FALLBACK_LOGO_DARK = '/brand/logo/worktide-lockup-dark.svg';

const CACHE_KEY = 'wt.branding';

/** Read the last-applied branding for a flash-free first paint. */
export function readCachedBranding(): Branding {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      return { ...DEFAULT_BRANDING, ...(JSON.parse(raw) as Partial<Branding>) };
    }
  } catch {
    /* ignore malformed cache */
  }
  return DEFAULT_BRANDING;
}

/**
 * Apply branding to the document: override the primary-color CSS variables,
 * set the tab title and theme-color meta. Idempotent — safe to call with the
 * cached value on boot and again after the network fetch.
 */
export function applyBranding(b: Branding): void {
  const root = document.documentElement;
  // shadcn primary family — buttons, links, focus ring, active sidebar item.
  for (const varName of ['--primary', '--ring', '--sidebar-primary', '--sidebar-ring']) {
    root.style.setProperty(varName, b.primaryColor);
  }
  // Expose the accent for any brand-specific styling that wants it.
  root.style.setProperty('--brand-accent', b.accentColor);

  document.title = b.name;

  const themeColor = document.querySelector('meta[name="theme-color"]');
  themeColor?.setAttribute('content', b.primaryColor);
}

/** Fetch branding from the public endpoint, applying defaults for missing keys. */
export async function fetchBranding(): Promise<Branding> {
  const res = await fetch(`${API_BASE}/branding`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`branding fetch failed: ${res.status}`);
  const data = (await res.json()) as Partial<Branding>;
  const branding = { ...DEFAULT_BRANDING, ...data };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(branding));
  } catch {
    /* ignore quota / private-mode errors */
  }
  return branding;
}

/** Logo URL for the current theme, with a bundled fallback. */
export function logoFor(b: Branding, dark = false): string {
  if (dark) return b.logoUrlDark || b.logoUrl || FALLBACK_LOGO_DARK;
  return b.logoUrl || FALLBACK_LOGO;
}
