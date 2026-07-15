import { api } from '@/lib/api';

/**
 * Frontend build identity, injected at build time (see vite.config.ts):
 *  - VITE_APP_VERSION  release tag (e.g. "v0.1.1"), operator build var
 *  - VITE_APP_COMMIT   git SHA (Coolify SOURCE_COMMIT)
 *  - __APP_BUILD_TIME__ ISO timestamp stamped when Vite built the bundle
 * Degrades to dev/unknown locally. Helps answer "which build is live?" and
 * spot a stale SPA talking to a newer API.
 */
declare const __APP_BUILD_TIME__: string | undefined;

const env = import.meta.env as Record<string, string | undefined>;
const commit = env.VITE_APP_COMMIT || 'unknown';
const shortCommit = commit !== 'unknown' ? commit.slice(0, 7) : 'unknown';
const version = env.VITE_APP_VERSION || (shortCommit !== 'unknown' ? shortCommit : 'dev');
const buildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : null;

export const APP_VERSION = { version, commit, shortCommit, buildTime } as const;

/** One-time console diagnostics: log the web build + the API build, warn on mismatch. */
export function logVersionDiagnostics(): void {
  const b = buildTime ? ` · built ${buildTime}` : '';
  console.info(`Worktide Web ${version} · ${shortCommit}${b}`);

  api
    .get<{ version: string; commit: string; shortCommit: string; buildTime: string | null }>('/version')
    .then(({ data }) => {
      const ab = data.buildTime ? ` · built ${data.buildTime}` : '';
      console.info(`Worktide API ${data.version} · ${data.shortCommit}${ab}`);
      if (
        commit !== 'unknown' &&
        data.commit &&
        data.commit !== 'unknown' &&
        data.commit !== commit
      ) {
        console.warn(
          `Version mismatch — web ${shortCommit} vs API ${data.shortCommit}. A hard refresh may be needed.`,
        );
      }
    })
    .catch(() => {
      /* non-critical */
    });
}
