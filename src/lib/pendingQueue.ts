import type { AxiosRequestConfig } from 'axios';

import { api, classifyError } from '@/lib/api';

/**
 * Persistent FIFO queue of "we tried to save and the network blinked" mutations.
 *
 * Why a queue at all: the alternative is "user makes 5 edits during a 10 s tunnel
 * reconnect, axios rejects all 5, we lose them." A debounced autosave can replay
 * the last value of one field, but it cannot recover writes to different fields
 * or different rows. Queueing the actual request payloads is the only honest
 * answer.
 *
 * The queue is stored in localStorage so it survives a tab refresh. Each entry
 * carries the axios config (method + url + body + minimal headers) and a
 * dedup key — if a second mutation arrives for the same key while the first is
 * still pending, the older one is dropped (last-write-wins, matches how every
 * field-level autosave already behaves).
 *
 * Draining happens on:
 *  - explicit drain() call (after a successful retry-on-foreground call)
 *  - browser `online` event
 *  - app boot (initial drain in case the queue survived a refresh)
 *  - recovery `wt-network-status` event (axios saw a request succeed again)
 *
 * Failed-after-N-retries entries are kept with `dead: true` so the UI can
 * surface them ("3 edits could not be saved — copy to clipboard?") instead of
 * silently dropping work.
 */

const STORAGE_KEY = 'wt.pending-mutations';
const MAX_ATTEMPTS = 6;

export type QueuedMutation = {
  id: string;
  key: string;
  method: 'patch' | 'put' | 'post' | 'delete';
  url: string;
  body?: unknown;
  contentType?: string;
  /** Human label shown in the toast — e.g. "Aufgabe 'X' aktualisieren". */
  label: string;
  queuedAt: number;
  attempts: number;
  dead?: boolean;
  lastError?: string;
};

type QueueListener = (queue: QueuedMutation[]) => void;

const listeners = new Set<QueueListener>();

function read(): QueuedMutation[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

function write(next: QueuedMutation[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota — drop the queue so we don't wedge the app. The user
    // will see "Speichern fehlgeschlagen" toasts but at least the app
    // keeps running.
  }
  for (const fn of listeners) fn(next);
}

export function subscribePendingQueue(fn: QueueListener): () => void {
  listeners.add(fn);
  fn(read());
  return () => {
    listeners.delete(fn);
  };
}

export function readPendingQueue(): QueuedMutation[] {
  return read();
}

export function enqueueMutation(
  entry: Omit<QueuedMutation, 'id' | 'queuedAt' | 'attempts'>,
): void {
  const queue = read();
  const filtered = queue.filter((m) => m.key !== entry.key);
  filtered.push({
    ...entry,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: Date.now(),
    attempts: 0,
  });
  write(filtered);
}

export function clearDeadMutations(): void {
  write(read().filter((m) => !m.dead));
}

export function discardMutation(id: string): void {
  write(read().filter((m) => m.id !== id));
}

let draining = false;

/**
 * Run the queue. Stops on the first network-class failure (no point
 * hammering a down link). Other failures bump the per-entry attempts
 * counter; entries past MAX_ATTEMPTS get marked `dead`.
 */
export async function drainPendingQueue(): Promise<void> {
  if (draining) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  draining = true;
  try {
    while (true) {
      const queue = read();
      const next = queue.find((m) => !m.dead);
      if (!next) return;

      const config: AxiosRequestConfig = {
        method: next.method,
        url: next.url,
        data: next.body,
      };
      if (next.contentType) {
        config.headers = { 'Content-Type': next.contentType };
      }
      try {
        await api.request(config);
        write(read().filter((m) => m.id !== next.id));
      } catch (err) {
        const kind = classifyError(err);
        if (kind === 'offline' || kind === 'timeout') {
          // Stop draining — try again on the next online/recovery event.
          return;
        }
        // 4xx / 5xx — count an attempt, give up at MAX_ATTEMPTS.
        const after = read().map((m) =>
          m.id === next.id
            ? {
                ...m,
                attempts: m.attempts + 1,
                dead: m.attempts + 1 >= MAX_ATTEMPTS,
                lastError: errorMessage(err),
              }
            : m,
        );
        write(after);
        if (kind === 'server') {
          // Server is up but broken — wait for the next external nudge.
          return;
        }
        // Validation / auth / unknown: if we just hit MAX_ATTEMPTS, that
        // entry is now dead and we move on to the next queue head.
      }
    }
  } finally {
    draining = false;
  }
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message?: unknown }).message ?? 'unknown');
  }
  return 'unknown';
}

/**
 * Wire the queue's drain triggers. Idempotent — calling twice is safe.
 * Call once from main.tsx (or whichever file is the SPA bootstrap).
 */
let wired = false;
export function installPendingQueueDrainers(): void {
  if (wired || typeof window === 'undefined') return;
  wired = true;

  window.addEventListener('online', () => {
    void drainPendingQueue();
  });

  window.addEventListener('wt-network-status', (e) => {
    if (e.detail.recovered) void drainPendingQueue();
  });

  // Initial drain in case the queue survived a refresh during an outage.
  void drainPendingQueue();
}
