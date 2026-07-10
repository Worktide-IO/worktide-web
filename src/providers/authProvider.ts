import type { AuthProvider } from '@refinedev/core';
import {
  api,
  clearAuth,
  JWT_STORAGE_KEY,
  readAuth,
  refreshAccessToken,
  REFRESH_STORAGE_KEY,
  REMEMBER_STORAGE_KEY,
  WORKSPACE_STORAGE_KEY,
  writeAuth,
} from '@/lib/api';
import { clearMercureToken } from '@/lib/mercure';

/**
 * Refine auth-provider wired to Worktide's JWT login endpoints:
 *
 *   POST /v1/auth/login    { email, password }     → { token, refresh_token }
 *   POST /v1/auth/refresh  { refresh_token }       → { token, refresh_token }
 *   POST /v1/auth/logout   (bearer)
 *   GET  /v1/auth/me       (bearer)                → { id, email, fullName, ... }
 *
 * The refresh-token rotation happens lazy on first 401 — onError below.
 * On hard auth failure (refresh also rejected) we wipe credentials and
 * redirect to /login.
 *
 * Workspace context: after login we fetch /v1/auth/me, pick the first
 * workspace membership and persist its UUID under wt.workspace so future
 * requests carry X-Workspace-Id automatically (see lib/api.ts).
 */
type LoginInput = { email?: string; password?: string; remember?: boolean };

export const authProvider: AuthProvider = {
  async login(params) {
    const { email, password, remember = true } = params as LoginInput;
    if (!email || !password) {
      return { success: false, error: { name: 'Missing', message: 'Email + Passwort erforderlich' } };
    }
    try {
      // Persist the choice BEFORE writing tokens so writeAuth picks the
      // right bucket on the very first call.
      localStorage.setItem(REMEMBER_STORAGE_KEY, remember ? '1' : '0');

      const { data } = await api.post<{ token: string; refresh_token: string }>(
        '/auth/login',
        { email, password },
        { headers: { Authorization: '' } }, // suppress any stale JWT
      );
      writeAuth(JWT_STORAGE_KEY, data.token);
      writeAuth(REFRESH_STORAGE_KEY, data.refresh_token);
    } catch {
      // Only the credentials-check is allowed to fail with "LoginFailed".
      return {
        success: false,
        error: { name: 'LoginFailed', message: 'Ungültige Zugangsdaten.' },
      };
    }
    // Workspace bootstrap is best-effort and must NOT roll back the login.
    // If /auth/me throws transiently, check() will retry on next nav.
    try {
      const me = await api.get('/auth/me');
      const workspaceId = me.data?.workspaces?.[0]?.id ?? me.data?.workspaceId;
      if (workspaceId) {
        writeAuth(WORKSPACE_STORAGE_KEY, workspaceId);
      }
    } catch {
      // intentional fallthrough
    }
    return { success: true, redirectTo: '/' };
  },

  async logout() {
    try {
      await api.post('/auth/logout', {});
    } catch {
      // intentional: even if revocation fails, drop the local creds
    }
    clearAuth(JWT_STORAGE_KEY);
    clearAuth(REFRESH_STORAGE_KEY);
    clearAuth(WORKSPACE_STORAGE_KEY);
    clearMercureToken();
    return { success: true, redirectTo: '/login' };
  },

  async check() {
    const jwt = readAuth(JWT_STORAGE_KEY);
    if (!jwt) {
      return { authenticated: false, redirectTo: '/login' };
    }
    // Bootstrap wt.workspace if missing. Two real causes:
    //  - The JWT is older than the workspace-persistence code (legacy
    //    session from before that ship).
    //  - The original login picked up the JWT successfully but /auth/me
    //    threw transiently and we never reached the workspace-set step.
    // Either way, requests that need X-Workspace-Id (PAT-creates,
    // workspace-scoped PATCH, etc.) silently fail until the user
    // re-logs in — fix that here once per affected boot.
    if (!readAuth(WORKSPACE_STORAGE_KEY)) {
      try {
        const me = await api.get('/auth/me');
        const ws = me.data?.workspaces?.[0]?.id ?? me.data?.workspaceId;
        if (ws) writeAuth(WORKSPACE_STORAGE_KEY, ws);
      } catch {
        // /auth/me itself failed — let the request that revealed this
        // surface its own error; we'll get another chance next nav.
      }
    }
    return { authenticated: true };
  },

  async onError(error) {
    if ((error as { response?: { status?: number } })?.response?.status !== 401) {
      return {};
    }
    if (!readAuth(REFRESH_STORAGE_KEY)) {
      return { logout: true, redirectTo: '/login' };
    }
    // Share ONE refresh across all concurrent 401s (rotation-safe).
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
