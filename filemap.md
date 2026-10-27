# File map

- `app/` — Next.js routes (pages and API)
- `app/layout.tsx` — root layout, fonts (Geist, Noto Sans Khmer), metadata
- `app/globals.css` — brand tokens (copied from raevori-web) and global styles
- `app/page.tsx` — home page (demo picker)
- `app/api/health/route.ts` — health check for Coolify/Docker (`ok`)
- `components/shared/` — UI shared by both demos (added in Task 3)
- `features/table-order/` — Table Order domain, server store, screens (Tasks 4-6)
- `features/shop-assistant/` — Shop Assistant catalog, tools, chat engine, screens (Tasks 8-11)
- `lib/` — small shared helpers (i18n)
- `tests/unit/` — Vitest tests (`npm test`)
- `tests/e2e/` — Playwright tests (`npm run e2e`; builds and runs the standalone server on :3012)
- `scripts/start-standalone.mjs` — runs the production build like the Docker image does
- `Dockerfile` — production image for Coolify (Node standalone server on :3000)
- `docs/SPEC.md` — approved design; `docs/PLAN.md` — task list and status
- `CLAUDE.md` — rules for any session working here
