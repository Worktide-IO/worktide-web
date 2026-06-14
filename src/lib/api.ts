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

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: {
    Accept: 'application/ld+json',
    'Content-Type': 'application/ld+json',
  },
});

api.interceptors.request.use((config) => {
  const jwt = localStorage.getItem(JWT_STORAGE_KEY);
  if (jwt && config.headers) {
    config.headers.Authorization = `Bearer ${jwt}`;
  }
  const ws = localStorage.getItem(WORKSPACE_STORAGE_KEY);
  if (ws && config.headers && !config.headers['X-Workspace-Id']) {
    config.headers['X-Workspace-Id'] = ws;
  }
  return config;
});
