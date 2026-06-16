import type { AuthProvider } from '@refinedev/core';
import {
  api,
  clearAuth,
  JWT_STORAGE_KEY,
  readAuth,
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

      const me = await api.get('/auth/me');
      const workspaceId = me.data?.workspaces?.[0]?.id ?? me.data?.workspaceId;
      if (workspaceId) {
        writeAuth(WORKSPACE_STORAGE_KEY, workspaceId);
      }
      return { success: true, redirectTo: '/' };
    } catch (e) {
      return {
        success: false,
        error: { name: 'LoginFailed', message: 'Ungültige Zugangsdaten.' },
      };
    }
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
    return { authenticated: true };
  },

  async onError(error) {
    if ((error as { response?: { status?: number } })?.response?.status !== 401) {
      return {};
    }
    const refresh = readAuth(REFRESH_STORAGE_KEY);
    if (!refresh) {
      return { logout: true, redirectTo: '/login' };
    }
    try {
      const { data } = await api.post<{ token: string; refresh_token: string }>(
        '/auth/refresh',
        { refresh_token: refresh },
        { headers: { Authorization: '' } },
      );
      writeAuth(JWT_STORAGE_KEY, data.token);
      writeAuth(REFRESH_STORAGE_KEY, data.refresh_token);
      return {};
    } catch {
      return { logout: true, redirectTo: '/login' };
    }
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
