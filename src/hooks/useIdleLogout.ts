import { useLogout } from '@refinedev/core';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

/**
 * Auto-logout when the user has been inactive for `minutes` minutes.
 *
 * "Inactive" means none of: mousemove, mousedown, keydown, scroll,
 * visibilitychange-to-visible. We deliberately do NOT count idle API
 * calls or background fetches — only direct user interaction extends
 * the timer.
 *
 * Pass `null` (or <= 0) to disable. The hook then clears any pending
 * timer immediately so toggling it off in settings has instant effect.
 *
 * The timer is debounced to one rAF per event burst so a 60fps mouse
 * move stream doesn't reset the timeout a thousand times per second.
 */
export function useIdleLogout(minutes: number | null | undefined): void {
  const { mutate: logout } = useLogout();
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!minutes || minutes <= 0) return;

    const limitMs = minutes * 60_000;

    const fire = () => {
      timerRef.current = null;
      toast.warning('Aufgrund von Inaktivität automatisch abgemeldet.');
      logout();
    };

    const arm = () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(fire, limitMs);
    };

    const onActivity = () => {
      // Coalesce bursts; one re-arm per animation frame is enough.
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        arm();
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') arm();
    };

    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    arm();

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', onVisibility);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [minutes, logout]);
}
