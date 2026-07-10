import type { AuthProvider } from '@refinedev/core';
import {
  api,
  clearAuth,
  getAccessToken,
  hasSessionHint,
  refreshAccessToken,
  setAccessToken,
  setSessionHint,
  WORKSPACE_STORAGE_KEY,
  writeAuth,
} from '@/lib/api';
import { clearMercureToken } from '@/lib/mercure';

/**
 * Refine auth-provider wired to Worktide's JWT login endpoints:
 *
 *   POST /v1/auth/login    { email, password }   → { token }   (+ httpOnly refresh cookie)
 *   POST /v1/auth/refresh  {}  (cookie)          → { token }   (rotates the cookie)
 *   POST /v1/auth/logout   (bearer, cookie)      → clears the cookie + revokes
 *   GET  /v1/auth/me       (bearer)              → { id, email, fullName, ... }
 *
 * Auth model (M1): the access token (JWT) is held in memory only; the refresh
 * token is an httpOnly cookie. On load/reload check() silently refreshes from
 * the cookie to restore the session; on a 401 the token is refreshed + the
 * request replayed (lib/api.ts). Hard failure → wipe + redirect to /login.
 */
type LoginInput = { email?: string; password?: string };

function readWorkspace(): string | null {
  return localStorage.getItem(WORKSPACE_STORAGE_KEY);
}

/** Best-effort: persist the caller's first workspace so requests carry X-Workspace-Id. */
async function bootstrapWorkspace(): Promise<void> {
  if (readWorkspace()) return;
  try {
    const me = await api.get('/auth/me');
    const ws = me.data?.workspaces?.[0]?.id ?? me.data?.workspaceId;
    if (ws) writeAuth(WORKSPACE_STORAGE_KEY, ws);
  } catch {
    // transient — check()/next nav retries
  }
}

export const authProvider: AuthProvider = {
  async login(params) {
    const { email, password } = params as LoginInput;
    if (!email || !password) {
      return { success: false, error: { name: 'Missing', message: 'Email + Passwort erforderlich' } };
    }
    try {
      const { data } = await api.post<{ token: string }>(
        '/auth/login',
        { email, password },
        { headers: { Authorization: '' } }, // suppress any stale JWT
      );
      setAccessToken(data.token); // in-memory; the refresh cookie is set by the response
      setSessionHint(true); // remember a session exists so future loads may silent-refresh
    } catch {
      return {
        success: false,
        error: { name: 'LoginFailed', message: 'Ungültige Zugangsdaten.' },
      };
    }
    await bootstrapWorkspace();
    return { success: true, redirectTo: '/' };
  },

  async logout() {
    try {
      await api.post('/auth/logout', {}); // clears the httpOnly cookie + revokes the token
    } catch {
      // even if revocation fails, drop the local session
    }
    setAccessToken(null);
    setSessionHint(false); // no session → skip the silent refresh (and its console 401) on /login
    clearAuth(WORKSPACE_STORAGE_KEY);
    clearMercureToken();
    return { success: true, redirectTo: '/login' };
  },

  async check() {
    // A fresh load/reload has no in-memory token → silently refresh from the
    // httpOnly cookie. This is the session-restore path AND the auth gate;
    // Refine's <Authenticated> shows its loading fallback while this awaits.
    if (!getAccessToken()) {
      // Skip the refresh entirely when this browser has never held a session
      // (fresh visitor or post-logout): the POST would 401 with no cookie and
      // the browser logs that 401 to the console, which looks alarming on the
      // login screen. No hint → definitely unauthenticated, no request needed.
      if (!hasSessionHint()) {
        return { authenticated: false, redirectTo: '/login' };
      }
      const ok = await refreshAccessToken();
      if (!ok) {
        return { authenticated: false, redirectTo: '/login' };
      }
    }
    await bootstrapWorkspace();
    return { authenticated: true };
  },

  async onError(error) {
    if ((error as { response?: { status?: number } })?.response?.status !== 401) {
      return {};
    }
    // Share ONE refresh across all concurrent 401s (cookie-based, rotation-safe).
    const refreshed = await refreshAccessToken();
    return refreshed ? {} : { logout: true, redirectTo: '/login' };
  },

  async getIdentity() {
    try {
      const { data } = await api.get('/auth/me');
      return {
        id: data.id,
        email: data.email,
        name: data.fullName ?? data.email,
        avatar: data.avatarUrl,
      };
    } catch {
      return null;
    }
  },
};
