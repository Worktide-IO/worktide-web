import { defineConfig } from '@kubb/core';
import { pluginOas } from '@kubb/plugin-oas';
import { pluginTs } from '@kubb/plugin-ts';
import { pluginZod } from '@kubb/plugin-zod';

/**
 * OpenAPI codegen for the Worktide REST API.
 *
 * Source: API Platform 4 exposes the OpenAPI 3.1 spec at
 * `/v1/docs.jsonopenapi`. The spec contains 4 variants of every entity
 * (plain, `.html`, `.jsonld`, `.jsonMergePatch`); we keep only the ones
 * the SPA actually consumes:
 *   - `.jsonld`         — GET single + GET list response shape
 *   - `.jsonMergePatch` — PATCH body shape
 *   - plain (no suffix) — POST body shape + bare entity fallback
 *
 * Output:
 *   src/api/types/  → pure TypeScript types
 *   src/api/zod/    → Zod schemas (handy for form validation + runtime
 *                     guards on incoming data)
 *
 * Refresh whenever the backend schema changes:
 *   pnpm gen:api    (runs `kubb generate` per package.json)
 *
 * Kubb writes its output FILES every run, so committing the generated
 * `src/api/` snapshot is fine and keeps CI/build deterministic.
 */
export default defineConfig({
  root: '.',
  input: {
    path: 'https://api.worktide.ddev.site/v1/docs.jsonopenapi',
  },
  output: {
    path: './src/api',
    clean: true,
  },
  hooks: {
    done: ['echo "✓ kubb codegen done — types + zod schemas written to src/api/"'],
  },
  plugins: [
    pluginOas({
      validate: false, // API Platform's spec is fine; skip the slow validation pass
    }),
    pluginTs({
      output: { path: './types' },
      enumType: 'literal',
      dateType: 'string',     // ISO-string in the wire format; convert at use-sites
      unknownType: 'unknown',
    }),
    pluginZod({
      output: { path: './zod' },
      // typed:true would emit `z.ZodType<EntityName>` wrappers — but kubb 4.x
      // mixes `.omit()` into those wrappers, which Zod v4 dropped from the
      // generic ZodType<T> shape, breaking the build. We don't need the
      // typed inference for form validation anyway; plain schemas suffice.
      typed: false,
      dateType: 'string',
      unknownType: 'unknown',
    }),
  ],
});
