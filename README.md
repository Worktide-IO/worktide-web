# worktide-web

React 19 + TypeScript 6 SPA for the [Worktide](https://github.com/Worktide-IO/worktide) API.
Stack: **Vite 8** · **Refine 5** · **React Router 7** · **Tailwind CSS v4** ·
**TanStack Query 5** · **react-hook-form** · **Zod**.

## Local dev

The Symfony backend lives at `https://api.worktide.ddev.site` (DDEV) and serves
its REST API under `/v1`. The Vite dev server proxies `/v1/*` to that host so
CORS doesn't enter the picture in development.

```bash
pnpm install
pnpm dev     # http://localhost:5173
```

Demo login (from the Symfony fixtures): `sven@worktide.test` / `demo`.

## Configuration

| Env var | Default | What |
|---|---|---|
| `VITE_API_BASE` | `/v1` | Where the data + auth providers hit the backend |

In production point `VITE_API_BASE=https://api.worktide.example.com/v1` and
make sure CORS on the backend allows the SPA origin (see `nelmio_cors_bundle`
config in the Symfony repo).

## Project layout

```
src/
├── App.tsx              Refine + Router wiring
├── main.tsx             React entrypoint
├── index.css            Tailwind v4 + shadcn design tokens
├── lib/
│   ├── api.ts           Shared axios instance + JWT / workspace headers
│   └── utils.ts         cn() helper for class composition
├── providers/
│   ├── dataProvider.ts  Refine data provider for API Platform (Hydra/JSON-LD)
│   └── authProvider.ts  JWT login + refresh + workspace bootstrap
└── pages/
    ├── LoginPage.tsx
    └── DashboardPage.tsx
```

## Next milestones

- [ ] `npx shadcn@latest init` to materialise the component primitives
- [ ] OpenAPI codegen (kubb / openapi-typescript) → typed API client
- [ ] Refine `<ThemedLayout>` (sidebar + header) + first CRUD resource
- [ ] Mercure subscription hook for live task / timer updates
- [ ] Kanban board (`dnd-kit`)
- [ ] Active-timer pill in the header
- [ ] Rich-text Document editor (TipTap)
- [ ] Permission-matrix grid (workspace settings)

## Why Refine

Refine reads the API Platform OpenAPI spec, generates the boring CRUD pages
(Customer / Webhook / Subscription / Permission overrides) and gets out of the
way for the bespoke UIs (Kanban, timer, document editor). The data provider
is hand-rolled to handle API Platform's Hydra JSON-LD response shape.

## License

MIT — see `LICENSE`.
