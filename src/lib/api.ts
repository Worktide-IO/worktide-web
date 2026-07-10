import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

/**
 * Shared axios instance pointed at the Worktide REST API. Honors
 * VITE_API_BASE for production deploys; dev defaults to a path that the
 * Vite proxy forwards to api.worktide.ddev.site (see vite.config.ts).
 *
 * JWT lives in localStorage under "wt.jwt"; the request interceptor stamps
 * the Authorization header. On 401 a response interceptor refreshes the token
 * once and replays the request (transparent to the caller); if refresh fails it
 * rejects and authProvider.onError logs the user out.
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
  // 30s hard timeout — without this a wedged backend (slow load
  // balancer, half-deployed pod) leaves Refine spinners on forever
  // and the user can't tell the difference between "saving" and
  // "your save will never come back". 30s is comfortably above
  // every real request we serve.
  timeout: 30_000,
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

/**
 * Discriminated error-class — what the UI shows hinges on which
 * bucket the axios failure falls into. `network` covers the
 * "user can't trust the result" cases (offline, DNS, TCP RST,
 * timeout). `server` covers "the API is up but broke" (5xx).
 * `auth` covers the JWT lifecycle. `validation` is the bog-
 * standard 4xx the calling component already handles.
 */
export type NetworkErrorKind = 'offline' | 'timeout' | 'server' | 'auth' | 'validation' | 'unknown';

export function classifyError(error: unknown): NetworkErrorKind {
  if (!axios.isAxiosError(error)) return 'unknown';
  if (error.code === 'ECONNABORTED') return 'timeout';
  // Either the browser knows it's offline, or axios got back nothing
  // from the wire. Both render as 'offline' to the user — the banner
  // doesn't try to distinguish DNS-fail from WLAN-drop.
  if (error.code === 'ERR_NETWORK' || !error.response) return 'offline';
  const status = error.response.status;
  if (status === 401) return 'auth';
  if (status >= 500) return 'server';
  if (status >= 400) return 'validation';
  return 'unknown';
}

/**
 * Single-flight access-token refresh, shared by the authProvider (401 on a
 * normal request) and the offline pending-queue drain. Refresh tokens ROTATE,
 * so concurrent callers must await ONE POST /auth/refresh — otherwise the first
 * rotation invalidates the token the others hold and they spuriously fail.
 * Resolves true iff a valid access token is now stored.
 */
let refreshInflight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (refreshInflight) {
    return refreshInflight;
  }
  // Check for a refresh token BEFORE creating the in-flight promise. If we did
  // it inside, the early `return false` would skip the `finally` that resets
  // `refreshInflight` — leaving it stuck as a resolved-false promise, so every
  // later refresh (even after a fresh login) would short-circuit to false.
  const refresh = readAuth(REFRESH_STORAGE_KEY);
  if (!refresh) {
    return Promise.resolve(false);
  }
  refreshInflight = (async () => {
    try {
      const { data } = await api.post<{ token: string; refresh_token: string }>(
        '/auth/refresh',
        { refresh_token: refresh },
        { headers: { Authorization: '' } },
      );
      writeAuth(JWT_STORAGE_KEY, data.token);
      writeAuth(REFRESH_STORAGE_KEY, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      refreshInflight = null;
    }
  })();

  return refreshInflight;
}

/**
 * CustomEvent the response interceptor emits on the window so the
 * <NetworkStatusBanner /> and the useResilientMutation queue can
 * react without a global state library. Detail carries the kind,
 * the URL we were trying, and the human-formatted message.
 */
export type NetworkStatusEventDetail = {
  kind: NetworkErrorKind;
  url?: string;
  status?: number;
  message: string;
  recovered?: boolean;
};

declare global {
  interface WindowEventMap {
    'wt-network-status': CustomEvent<NetworkStatusEventDetail>;
  }
}

export function emitNetworkStatus(detail: NetworkStatusEventDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('wt-network-status', { detail }));
}

// Track recently-emitted state so consecutive interceptor failures
// from the same surface don't carpet-bomb the listener. The banner
// uses this to debounce noisy bursts (e.g. The Wall fanout where
// 6 queries fail in 50 ms during a tunnel reconnect).
let lastEmittedKind: NetworkErrorKind | null = null;
let recoveryTimer: number | null = null;

api.interceptors.response.use(
  (response) => {
    // A successful response after a non-success means the link is
    // back. Debounced so a single late success in a longer outage
    // doesn't claim "recovered" prematurely.
    if (lastEmittedKind !== null && lastEmittedKind !== 'auth' && lastEmittedKind !== 'validation') {
      if (recoveryTimer !== null) {
        window.clearTimeout(recoveryTimer);
      }
      recoveryTimer = window.setTimeout(() => {
        emitNetworkStatus({ kind: 'unknown', message: 'Verbindung wiederhergestellt.', recovered: true });
        lastEmittedKind = null;
        recoveryTimer = null;
      }, 400);
    }
    return response;
  },
  (error: AxiosError) => {
    const kind = classifyError(error);
    // 4xx + auth are component-owned (login form / voters); don't
    // pollute the banner with them.
    if (kind === 'offline' || kind === 'timeout' || kind === 'server') {
      lastEmittedKind = kind;
      emitNetworkStatus({
        kind,
        url: error.config?.url,
        status: error.response?.status,
        message: humanReadable(kind, error),
      });
    }
    return Promise.reject(error);
  },
);

// On 401: refresh the access token once and replay the original request, so a
// transparently-recoverable expiry never surfaces as a query error (M2 — Refine's
// onError can't retry the failed query, it would stay errored until a manual
// refetch). refreshAccessToken() is single-flight, so concurrent 401s share one
// refresh. If refresh fails we reject and let authProvider.onError log out.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status !== 401 || !original || original._retried) {
      return Promise.reject(error);
    }
    // Never recurse on the refresh call itself.
    if (typeof original.url === 'string' && original.url.includes('/auth/refresh')) {
      return Promise.reject(error);
    }
    original._retried = true;
    const ok = await refreshAccessToken();
    if (!ok) return Promise.reject(error);
    // The request interceptor re-reads JWT_STORAGE_KEY, so the replay carries the
    // fresh token.
    return api(original);
  },
);

function humanReadable(kind: NetworkErrorKind, error: AxiosError): string {
  switch (kind) {
    case 'offline':
      return navigator.onLine === false
        ? 'Keine Internetverbindung.'
        : 'Worktide-Server nicht erreichbar.';
    case 'timeout':
      return 'Die Antwort dauerte zu lange (>30 s). Bitte erneut versuchen.';
    case 'server':
      return `Server-Fehler (${error.response?.status ?? '5xx'}). Wir prüfen das.`;
    case 'auth':
      return 'Sitzung abgelaufen — bitte erneut anmelden.';
    case 'validation':
      return error.response?.statusText ?? 'Eingabe nicht akzeptiert.';
    default:
      return error.message ?? 'Unbekannter Fehler.';
  }
}
