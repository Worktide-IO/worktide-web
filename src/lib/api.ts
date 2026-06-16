import axios, { type AxiosInstance } from 'axios';

/**
 * Shared axios instance pointed at the Worktide REST API. Honors
 * VITE_API_BASE for production deploys; dev defaults to a path that the
 * Vite proxy forwards to api.worktide.ddev.site (see vite.config.ts).
 *
 * JWT lives in localStorage under "wt.jwt"; the request interceptor stamps
 * the Authorization header. On 401 we let the auth provider decide
 * (token refresh vs. redirect to login) — no silent retries here so
 * failure paths stay observable.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/v1';
export const JWT_STORAGE_KEY = 'wt.jwt';
export const REFRESH_STORAGE_KEY = 'wt.refresh';
export const WORKSPACE_STORAGE_KEY = 'wt.workspace';
/** Persisted "Angemeldet bleiben" choice; survives tab-close so even
 *  empty sessionStorage can decide which bucket to write into. */
export const REMEMBER_STORAGE_KEY = 'wt.remember';

/**
 * Auth-token storage chooser. Two buckets:
 *   - localStorage  → persists across tabs + browser restarts.
 *   - sessionStorage → wiped on tab/browser close.
 *
 * Choice is set at login: "Angemeldet bleiben" → localStorage,
 * unchecked → sessionStorage. Default is localStorage so existing
 * users keep the prior behaviour without an extra click.
 *
 * Readers fall through both buckets so a token written to either
 * survives bootstrap. Writers go to the chosen bucket only and clear
 * the other one to keep state consistent.
 */
export function authStorage(): Storage {
  return localStorage.getItem(REMEMBER_STORAGE_KEY) === '0' ? sessionStorage : localStorage;
}

export function readAuth(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

export function writeAuth(key: string, value: string): void {
  const target = authStorage();
  target.setItem(key, value);
  // Wipe the *other* bucket so a leftover stale token from a previous
  // setting can't shadow the fresh one.
  (target === localStorage ? sessionStorage : localStorage).removeItem(key);
}

export function clearAuth(key: string): void {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    Accept: 'application/ld+json',
    'Content-Type': 'application/ld+json',
  },
});

api.interceptors.request.use((config) => {
  const jwt = readAuth(JWT_STORAGE_KEY);
  if (jwt && config.headers) {
    config.headers.Authorization = `Bearer ${jwt}`;
  }
  const ws = readAuth(WORKSPACE_STORAGE_KEY);
  if (ws && config.headers && !config.headers['X-Workspace-Id']) {
    config.headers['X-Workspace-Id'] = ws;
  }
  return config;
});
