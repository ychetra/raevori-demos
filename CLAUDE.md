# Raevori demos (demo.raevori.com)

Next.js 16 + React 19 + Tailwind 4 + TypeScript, Node server (`output: "standalone"`), deployed by Coolify from GitHub `main`.

Read first: `docs/SPEC.md` (what and why), `docs/PLAN.md` (task list; continue from the first unticked task), `docs/DESIGN.md` (approved visuals, once it exists), `filemap.md` (where things live).

Commands:
- `npm run dev` → http://localhost:3002 (owner views it from a Mac via `ssh -L 3002:localhost:3002 ubuntu@161.118.223.128`)
- `npm test` (Vitest), `npm run e2e` (Playwright; Chromium at `~/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome`)
- `npm run build`

Rules:
- Test it yourself before handing anything to the owner: unit + e2e green, and screenshots at 360/390/1280 reviewed in both languages.
- No decorative status dots, coloured bullets or "online" dots. Brand tokens match `~/raevori-web/app/globals.css`; light mode default.
- All Khmer strings in `features/<demo>/km.ts` (owner gets them natively reviewed).
- KHQR is simulated: QR value `Raevori demo, not a payment`; never a real KHQR/EMV payload.
- Secrets (`GEMINI_API_KEY`, `SESSION_SECRET`) are server-only; never in client code or git.
- Tick the task in `docs/PLAN.md` and commit after each accepted task. Push only when the owner says so.
- Commit author `ychetra <chetra.storeit@gmail.com>`; end messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
