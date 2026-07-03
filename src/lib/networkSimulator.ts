import type { InternalAxiosRequestConfig } from 'axios';

import { api, classifyError } from '@/lib/api';

/**
 * Dev-only network simulator. Injects offline / 500 / slow into the
 * shared axios instance so you can validate the resilience layer
 * without unplugging the LAN cable or stopping the backend.
 *
 * Persists the current mode in localStorage so a hot-reload doesn't
 * silently turn it back off — that would mask bugs that only appear
 * with the simulator on. The toggle expires automatically after
 * `durationMs` to avoid a forgotten "offline mode" haunting a real
 * session.
 *
 * Modes:
 *  - 'offline' → reject every request with a synthetic Network Error
 *    (no `response`, code === 'ERR_NETWORK') so api.ts classifies
 *    it as 'offline'.
 *  - 'server'  → resolve every request with status 503 + a JSON body
 *    so api.ts classifies it as 'server'.
 *  - 'slow'    → delay every response by `slowMs` (default 8 s) so
 *    the 30 s timeout still lets it through but the spinner shows.
 *  - 'off'     → simulator inactive (default).
 *
 * Activation goes through the interceptors registered here. We only
 * register them on import; if NODE_ENV is production they are not
 * imported (App.tsx guards). The interceptors are no-ops when mode
 * is 'off' so leaving them installed is harmless.
 */

const STORAGE_KEY = 'wt.network-sim';

export type SimulatorMode = 'off' | 'offline' | 'server' | 'slow';

type SimulatorState = {
  mode: SimulatorMode;
  /** Epoch ms when the simulator should disable itself. */
  expiresAt: number;
  slowMs: number;
};

const DEFAULT_DURATION_MS = 60_000;
const DEFAULT_SLOW_MS = 8_000;

function read(): SimulatorState {
  if (typeof localStorage === 'undefined') return { mode: 'off', expiresAt: 0, slowMs: DEFAULT_SLOW_MS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: 'off', expiresAt: 0, slowMs: DEFAULT_SLOW_MS };
    const parsed = JSON.parse(raw) as Partial<SimulatorState>;
    return {
      mode: (parsed.mode ?? 'off') as SimulatorMode,
      expiresAt: typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0,
      slowMs: typeof parsed.slowMs === 'number' ? parsed.slowMs : DEFAULT_SLOW_MS,
    };
  } catch {
    return { mode: 'off', expiresAt: 0, slowMs: DEFAULT_SLOW_MS };
  }
}

function write(next: SimulatorState): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  for (const fn of listeners) fn(activeMode(next));
}

const listeners = new Set<(mode: SimulatorMode) => void>();

function activeMode(s: SimulatorState): SimulatorMode {
  if (s.mode === 'off') return 'off';
  if (s.expiresAt > 0 && Date.now() > s.expiresAt) return 'off';
  return s.mode;
}

export function readSimulatorMode(): SimulatorMode {
  return activeMode(read());
}

export function readSimulatorState(): SimulatorState {
  return read();
}

export function subscribeSimulator(fn: (mode: SimulatorMode) => void): () => void {
  listeners.add(fn);
  fn(readSimulatorMode());
  return () => {
    listeners.delete(fn);
  };
}

export function setSimulatorMode(
  mode: SimulatorMode,
  options?: { durationMs?: number; slowMs?: number },
): void {
  const durationMs = options?.durationMs ?? DEFAULT_DURATION_MS;
  const slowMs = options?.slowMs ?? read().slowMs ?? DEFAULT_SLOW_MS;
  write({
    mode,
    expiresAt: mode === 'off' ? 0 : Date.now() + durationMs,
    slowMs,
  });
}

let installed = false;

/**
 * Register the simulator interceptors on the shared axios instance.
 * Idempotent. Call once from App.tsx — guarded by `import.meta.env.DEV`
 * so the bundled prod build doesn't carry the simulator.
 */
export function installNetworkSimulator(): void {
  if (installed) return;
  installed = true;

  api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
    const mode = readSimulatorMode();
    if (mode === 'offline') {
      const err = new Error('Simulated offline') as Error & { code?: string; config?: unknown };
      err.code = 'ERR_NETWORK';
      err.config = config;
      throw err;
    }
    if (mode === 'server') {
      // We reject here so classifyError() runs through the response
      // path. Compose a fake AxiosError that the interceptor will see.
      const err = new Error('Simulated 503') as Error & {
        config?: unknown;
        response?: { status: number; data: unknown; headers: Record<string, string>; statusText: string };
        isAxiosError?: boolean;
      };
      err.isAxiosError = true;
      err.config = config;
      err.response = {
        status: 503,
        statusText: 'Service Unavailable (simulated)',
        data: { detail: 'Simulated 503 from networkSimulator' },
        headers: { 'content-type': 'application/json' },
      };
      throw err;
    }
    if (mode === 'slow') {
      const { slowMs } = read();
      await new Promise((r) => window.setTimeout(r, slowMs));
    }
    void classifyError; // ensure tree-shaker keeps the helper for callers
    return config;
  });
}
