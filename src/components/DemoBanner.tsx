import { useBranding } from '@/providers/BrandingProvider';

/**
 * Thin red banner marking the instance as a demo. Driven by the public
 * GET /v1/branding payload (`demoMode` / `demoBannerText`, from the backend's
 * DEMO_MODE env), so an operator toggles it without any frontend rebuild.
 *
 * Rendered at the very top of the app tree (inside BrandingProvider), so it
 * sits above every page — login, setup and the authenticated shell alike — in
 * normal flow, gently pushing the rest of the UI down. Renders nothing when
 * demo mode is off.
 */
export function DemoBanner() {
  const { demoMode, demoBannerText } = useBranding();
  if (!demoMode) return null;

  return (
    <div
      role="status"
      className="w-full bg-red-600 px-4 py-1 text-center text-xs font-medium tracking-wide text-white"
    >
      {demoBannerText || 'Demo-Modus – Beispieldaten, keine echten Kundendaten.'}
    </div>
  );
}
