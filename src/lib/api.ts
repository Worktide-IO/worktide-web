import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

/**
 * Shared axios instance pointed at the Worktide REST API. Honors
 * VITE_API_BASE for production deploys; dev defaults to a path that the
 * Vite proxy forwards to api.worktide.ddev.site (see vite.config.ts).
 *
 * Auth (M1): the refresh token lives in an httpOnly cookie the browser sends
 * automatically (withCredentials) — never in JS-readable storage. The short-
 * lived access token (JWT, ~1h) is held in MEMORY only (below); on load/reload
 * the app silently refreshes from the cookie (authProvider.check). On 401 a
 * response interceptor refreshes once and replays the request.
 *
 * Only non-sensitive prefs (the selected workspace id) live in localStorage.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? '/v1';
export const WORKSPACE_STORAGE_KEY = 'wt.workspace';

// Non-sensitive hint: "this browser has had a session before" (set on login /
// successful refresh, cleared on logout / failed refresh). Lets the app skip the
// silent POST /auth/refresh on a fresh or logged-out browser — that request 401s
// when there's no cookie, and the browser logs every 401 to the console as an
// error, which reads as a scary failure on the login page. The refresh cookie is
// httpOnly (JS can't read it), so this flag is our only client-visible signal of
// a probable session; it never gates real auth (the cookie does).
export const SESSION_HINT_KEY = 'wt.session';
export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}
export function setSessionHint(on: boolean): void {
  try {
    if (on) {
      localStorage.setItem(SESSION_HINT_KEY, '1');
    } else {
      localStorage.removeItem(SESSION_HINT_KEY);
    }
  } catch {
    /* private mode / storage disabled — refresh simply proceeds as before */
  }
}

// In-memory access token — deliberately NOT persisted, so XSS can't lift a
// long-lived credential and a closed tab ends the in-memory session (the cookie
// still allows a silent re-auth until it expires / is revoked).
let accessToken: string | null = null;
export function getAccessToken(): string | null {
  return accessToken;
}
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** localStorage helpers for non-sensitive prefs (workspace id). */
export function readAuth(key: string): string | null {
  return localStorage.getItem(key);
}
export function writeAuth(key: string, value: string): void {
  localStorage.setItem(key, value);
}
export function clearAuth(key: string): void {
  localStorage.removeItem(key);
}

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  // Send + accept the httpOnly refresh-token cookie on cross-origin XHR
  // (web → api). Harmless same-origin (dev via the Vite proxy).
  withCredentials: true,
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
  const jwt = getAccessToken();
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
 * normal request, silent-refresh-on-load) and the offline pending-queue drain.
 * The refresh token travels as the httpOnly cookie (withCredentials) — no body
 * token — and the backend rotates it into a fresh cookie. Concurrent callers
 * must await ONE POST /auth/refresh (the rotation invalidates prior tokens).
 * Resolves true iff a valid access token is now in memory.
 */
let refreshInflight: Promise<boolean> | null = null;

export function refreshAccessToken(): Promise<boolean> {
  if (refreshInflight) {
    return refreshInflight;
  }
  refreshInflight = (async () => {
    try {
      // No body token: the cookie carries it. Suppress any stale Bearer so a
      // just-expired access token can't shadow the cookie.
      const { data } = await api.post<{ token: string }>(
        '/auth/refresh',
        {},
        { headers: { Authorization: '' } },
      );
      if (!data?.token) {
        setSessionHint(false);
        return false;
      }
      setAccessToken(data.token);
      setSessionHint(true);
      return true;
    } catch {
      // No cookie / revoked / expired → not authenticated.
      setSessionHint(false);
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
    // The request interceptor re-reads the in-memory access token, so the replay
    // carries the fresh one.
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
