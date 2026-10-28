# Raevori portfolio demos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This project runs through `/savvy-flow:savvy-flow`; the tier on each task is the savvy worker to use.

**Goal:** Ship demo.raevori.com with two live, phone-first demos: Table Order (QR menu → simulated KHQR → live kitchen screen) and Shop Assistant (Gemini-powered sales chat in Khmer and English).

**Architecture:** One Next.js 16 app running as a Node server (`output: "standalone"`) in one Docker container on Coolify. Table Order keeps per-visitor rooms in an in-memory store and pushes changes over Server-Sent Events. Shop Assistant runs a server-side tool-calling loop behind a `ChatModel` interface (Gemini now, swappable), guarded by in-memory rate limits with a pre-recorded fallback.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, `qrcode` (SVG QR), `@google/genai`, Vitest, `@playwright/test`.

**Spec:** `docs/SPEC.md` (approved 2026-10-27). Read it before any task.

## Status

Resume rule: tick a task's checkbox only after the orchestrator accepts it and it is committed. A new session continues from the first unticked task.

- [x] Task 0: Spec, plan, CLAUDE.md, git init (orchestrator, 2026-10-27)
- [x] Task 1: Scaffold
- [x] Task 2: Design pass (orchestrator only, needs owner approval)
- [x] Task 3: Shared UI
- [x] Task 4: Table Order domain
- [x] Task 5: Table Order API and live updates
- [x] Task 6: Table Order screens
- [x] Task 7: Table Order end-to-end check
- [x] Task 8: Shop Assistant domain
- [x] Task 9: Chat engine and API
- [ ] Task 10: Gemini spike (needs `GEMINI_API_KEY` from owner) — waiting for the key; Tasks 11-12 were built on the fake model meanwhile
- [x] Task 11: Shop Assistant screens
- [ ] Task 12: Shop Assistant end-to-end check — steps 1-2 done (fake model); step 3 needs the key
- [x] Task 13: Home page, SEO, accessibility
- [ ] Task 14: Deploy to demo.raevori.com (needs owner's repo, Coolify app, key)
- [ ] Task 15: raevori.com work cards and case studies (in `~/raevori-web`) — built and committed locally (raevori-web f35638b); push + IndexNow wait for the owner and the demos deploy
- [x] Task 16: Shop Pulse domain (spec `docs/SPEC-SHOP-PULSE.md`, added 2026-10-28 at the owner's request for more demos; owner to review)
- [x] Task 17: Shop Pulse screens
- [x] Task 18: Shop Pulse end-to-end check
- [x] Task 19: Smart Queue domain and API (spec `docs/SPEC-QUEUE.md`, added 2026-10-28 at the owner's request for more demos; owner to review)
- [x] Task 20: Smart Queue screens
- [x] Task 21: Smart Queue end-to-end check
- [x] Task 22: Booking domain and API (spec `docs/SPEC-BOOKING.md`, added 2026-10-28 while the owner was away; owner to review)
- [x] Task 23: Booking screens
- [x] Task 24: Booking end-to-end check
- [x] Task 25: Café admin domain and API (spec `docs/SPEC-ADMIN.md`, owner asked 2026-10-28 for "like a real system" and chose the owner admin)
- [x] Task 26: Café admin screens
- [x] Task 27: Café admin end-to-end check
- [x] Task 28: Salon (Booking) admin
- [x] Task 29: Queue admin

Owner hand-off points: after Task 2 (approve designs), after Task 7 and Task 12 (try each demo), Task 10 and 14 (accounts). Before every hand-off the orchestrator runs the full test suite and reviews screenshots at 390px and 1280px itself.

## Global Constraints

- Next.js 16, React 19, Tailwind 4, TypeScript strict; Node 22; `output: "standalone"`.
- Brand tokens copied from `~/raevori-web/app/globals.css`: cream `#f4f1e8`, surface `#fbfaf5`, line `#e0dbcd`, ink `#141a15`, muted `#5d655d`, accent `#5f7d48`; dark `#0f1310` / `#a8c48f`. Light mode default.
- Fonts: Geist (latin), Noto Sans Khmer (Khmer) via `next/font/google`.
- No decorative status dots, coloured bullets or "online" dots. Map pins and form controls are fine.
- Every Khmer string lives in `features/<demo>/km.ts` (one file per demo) for the owner's native review.
- KHQR is simulated: the QR encodes `Raevori demo, not a payment`, never an EMV/KHQR payload. Every payment card shows "Demo, no money moves".
- No secrets in client code. Server-only env: `GEMINI_API_KEY`, `SESSION_SECRET`, `CHAT_MODEL` (`gemini` | `fake`), `CHAT_GLOBAL_DAILY_CAP`.
- Dev server: `npm run dev` on port **3002** (3000 and 3001 are taken on this server).
- Health check `GET /api/health` → `200 ok`, probed on `127.0.0.1`.
- Commit after each accepted task. Never push unless the owner says so.

## Review Focus

1. **Tampered orders:** a client sends its own prices, unknown item ids or invalid options → server recomputes totals from `MENU` and rejects bad input with 400. Test in Task 4 (`priceOrder`) and Task 5 (API).
2. **Dead room links:** a phone opens a menu URL whose room expired or never existed → a friendly "This demo table has closed" screen with "Start a new demo", not an error page. Test in Task 5 (404 JSON) and Task 7 (screen).
3. **Dropped live connection:** the phone sleeps or the network drops → on reconnect the client receives a full room snapshot and shows current statuses. Test in Task 5 (first SSE event is `snapshot`) and Task 7.
4. **AI failure:** Gemini errors, times out (15 s) or hits quota → the chat shows the "busy" message and offers the replay, never an endless spinner. Test in Task 9 (fake model throwing) and Task 12.
5. **Khmer input and layout:** Khmer text with Khmer digits (`៣`), mixed Khmer/English, and long Khmer words with no spaces → tools still match products and text wraps without overflow at 360px. Test in Task 8 (`searchProducts`) and Task 11/12 (screenshot at 360px).

---

## File Structure

```
app/
  layout.tsx, globals.css, page.tsx             home (Task 13)
  api/health/route.ts                           (Task 1)
  table-order/page.tsx                          kitchen screen + QR (Task 6)
  table-order/menu/page.tsx                     customer phone flow (Task 6)
  api/rooms/route.ts                            POST create room (Task 5)
  api/rooms/[id]/route.ts                       GET snapshot (Task 5)
  api/rooms/[id]/orders/route.ts                POST order (Task 5)
  api/rooms/[id]/orders/[orderId]/route.ts      PATCH advance (Task 5)
  api/rooms/[id]/events/route.ts                GET SSE (Task 5)
  shop-assistant/page.tsx                       (Task 11)
  api/chat/route.ts                             (Task 9)
components/shared/                              DemoBar, LangToggle, PhoneFrame, Qr, KhqrCard (Task 3)
features/table-order/                           types, menu, km, pricing, store, useRoom (Tasks 4-6)
features/shop-assistant/                        catalog.json, catalog, km, tools, limits, model, gemini, fake-model, agent, replay.json, session (Tasks 8-11)
lib/i18n.ts                                     Lang type + pick() (Task 3)
tests/unit/                                     Vitest
tests/e2e/                                      Playwright
docs/SPEC.md, docs/PLAN.md, docs/DESIGN.md, docs/CREDITS.md
CLAUDE.md, filemap.md, Dockerfile
```

---

### Task 1: Scaffold — tier: medium

**Files:** Create `package.json`, `next.config.ts` (`output: "standalone"`), `tsconfig.json`, `app/layout.tsx`, `app/globals.css` (brand tokens as CSS variables + Tailwind `@theme`), `app/page.tsx` (placeholder "Raevori demos"), `app/api/health/route.ts`, `vitest.config.ts`, `playwright.config.ts`, `tests/unit/health.test.ts`, `tests/e2e/smoke.spec.ts`, `Dockerfile`, `.dockerignore`, `.gitignore`, `filemap.md`.

**Interfaces — Produces:** scripts `dev` (`next dev -H 0.0.0.0 -p 3002`), `build`, `start`, `test` (vitest run), `e2e` (playwright test); Tailwind colour names `bg surface line fg muted accent` usable as `bg-bg`, `text-muted`, etc.

- [ ] **Step 1:** Write `tests/unit/health.test.ts`: importing `GET` from `app/api/health/route.ts` returns status 200 and body `ok`. Run `npm test` → FAIL.
- [ ] **Step 2:** Implement the scaffold and health route. Run `npm test` → PASS.
- [ ] **Step 3:** Playwright config: `chromium` project with `launchOptions.executablePath = process.env.CHROMIUM_PATH ?? "/home/ubuntu/.cache/ms-playwright/chromium-1243/chrome-linux-arm64/chrome"`, `webServer` = `npm run build && npm start -- -p 3012`, two projects: `phone` (390×844) and `desktop` (1280×900). `smoke.spec.ts`: home page shows "Raevori". Run `npm run e2e` → PASS.
- [ ] **Step 4:** Dockerfile: multi-stage `node:22-alpine`, copy `.next/standalone`, `.next/static`, `public`; `ENV HOSTNAME=0.0.0.0 PORT=3000`; `HEALTHCHECK CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1`. Verify `npm run build` succeeds (Docker itself is not available on this server; that is fine).
- [ ] **Step 5:** Write `filemap.md` (one line per directory/file). Commit `chore: scaffold demos app`.

### Task 2: Design pass — orchestrator only, not delegated

Produce hi-fi mockups in the brainstorming visual companion for: kitchen screen with QR (1280), menu / item sheet / cart / KHQR / status (390), Shop Assistant chat with product card, delivery quote and order + KHQR (390 and 1280 with the How-it-works panel), home page. Get the owner's approval. Record the decisions in `docs/DESIGN.md`: layout per screen, type scale, spacing, radii, component list with states, motion. Choose menu and catalog images and record licences in `docs/CREDITS.md`. Commit `docs: approved design`.

### Task 3: Shared UI — tier: medium

**Files:** Create `lib/i18n.ts`, `components/shared/{DemoBar,LangToggle,PhoneFrame,Qr,KhqrCard}.tsx`, `tests/unit/i18n.test.ts`, `tests/unit/qr.test.ts`.

**Interfaces — Produces:**
- `type Lang = "en" | "km"`; `type Text = { en: string; km: string }`; `pick(t: Text, lang: Lang): string`.
- `<LangToggle lang onChange />`; `<DemoBar />` ("A demo by Raevori Studio · Build one like this →" linking `https://raevori.com/#contact`); `<PhoneFrame>{children}</PhoneFrame>` (frame shown only ≥ 768px; full-bleed on phones).
- `<Qr value: string; size?: number; label: string />` renders an SVG via `qrcode.toString(value, { type: "svg" })`.
- `<KhqrCard amount: number; merchant: string; lang: Lang; onPaid: () => void />`: KHQR-styled card, QR value fixed to `Raevori demo, not a payment`, USD amount plus KHR at 4,100, button "Simulate payment", note "Demo, no money moves".

- [ ] **Step 1:** Tests: `pick({en:"Tea",km:"តែ"},"km") === "តែ"`; `KhqrCard`'s exported `KHQR_DEMO_VALUE === "Raevori demo, not a payment"` and `khr(4.5) === "18,450"`. Run → FAIL.
- [ ] **Step 2:** Implement following `docs/DESIGN.md`. Run tests → PASS. Add a `/dev/ui` page rendering every component in both languages; screenshot at 390 and 1280 for the orchestrator.
- [ ] **Step 3:** Commit `feat: shared demo UI`.

### Task 4: Table Order domain — tier: careful

**Files:** Create `features/table-order/{types,menu,km,pricing,store}.ts`, `tests/unit/table-order/{pricing,store}.test.ts`.

**Interfaces — Produces:**
```ts
type OrderStatus = "new" | "preparing" | "ready";
type OptionGroup = { id: string; name: Text; choices: { id: string; name: Text; delta: number }[]; default: string };
type MenuItem = { id: string; cat: "coffee" | "tea" | "bakery" | "smoothie"; name: Text; price: number; image: string; options: OptionGroup[] };
type CartLine = { itemId: string; qty: number; options: Record<string, string> };
type OrderLine = CartLine & { name: Text; unitPrice: number };
type Order = { id: string; room: string; table: number; lines: OrderLine[]; total: number; payment: "khqr"; status: OrderStatus; at: Partial<Record<OrderStatus, number>> };
type RoomEvent = { type: "snapshot"; orders: Order[] } | { type: "order"; order: Order };
type Room = { id: string; orders: Order[]; touchedAt: number };
const MENU: MenuItem[]   // ~14 items, 4 categories, Text names from km.ts
priceOrder(lines: CartLine[]): { lines: OrderLine[]; total: number }   // throws PricingError
interface RoomStore {
  create(): Room; get(id: string): Room | undefined;
  addOrder(id: string, table: number, lines: CartLine[]): Order;     // throws RoomError("not_found" | "full")
  advance(id: string, orderId: string): Order;                        // new→preparing→ready; ready stays ready
  subscribe(id: string, fn: (e: RoomEvent) => void): () => void;
  sweep(): void;
}
createMemoryStore(opts?: { maxRooms?: number; maxOrders?: number; ttlMs?: number; now?: () => number }): RoomStore  // defaults 500, 30, 2h
```
Room ids: `crypto.randomBytes(12).toString("base64url")`. New rooms are seeded with 2 example orders (tables 2 and 7). Prices in USD, two decimals, computed in cents.

- [ ] **Step 1:** `pricing.test.ts`: 2× iced latte with size `large` (+0.50) totals `5.50`; unknown `itemId` throws; unknown option choice throws; `qty` 0, negative, non-integer or > 20 throws; client-supplied fields other than `itemId/qty/options` are ignored.
- [ ] **Step 2:** `store.test.ts`: `create()` id is ≥ 16 chars and room has 2 seeded orders; `addOrder` on unknown id throws `not_found`; 31st order throws `full`; `advance` goes new→preparing→ready and stays ready; subscriber receives `{type:"order"}` on add and advance; `sweep()` with `now` past 2h removes the room; creating room 501 evicts the least recently touched.
- [ ] **Step 3:** Run → FAIL. Implement. Run → PASS. Commit `feat: table order domain`.

### Task 5: Table Order API and live updates — tier: careful

**Files:** Create the five `app/api/rooms/**` routes listed above, `features/table-order/server.ts` (singleton `store` on `globalThis`, interval `sweep` every 5 min), `tests/unit/table-order/api.test.ts`.

**Interfaces — Consumes:** Task 4. **Produces:** `POST /api/rooms` → `201 {id}`; `GET /api/rooms/:id` → `{orders}` or `404 {error:"not_found"}`; `POST /api/rooms/:id/orders` body `{table, lines: CartLine[]}` → `201 Order` / `400 {error}` / `404` / `429 {error:"full"}`; `PATCH /api/rooms/:id/orders/:orderId` → `Order`; `GET /api/rooms/:id/events` → `text/event-stream`, first event `snapshot`, then `order` events, comment ping every 20 s, headers `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`.

- [ ] **Step 1:** Tests call the route handlers directly: tampered `unitPrice`/`total` in body is ignored (server total wins); bad JSON → 400; table outside 1-50 → 400; unknown room → 404; events stream's first chunk parses to `{type:"snapshot"}`; an order posted after subscribing arrives as `{type:"order"}`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS. Commit `feat: table order API with live updates`.

### Task 6: Table Order screens — tier: medium

**Files:** Create `app/table-order/page.tsx`, `app/table-order/menu/page.tsx`, `features/table-order/useRoom.ts`, components under `features/table-order/ui/` as named in `docs/DESIGN.md`.

**Interfaces — Consumes:** Tasks 3-5. **Produces:** `useRoom(roomId: string): { orders: Order[]; status: "connecting" | "live" | "closed" }` (EventSource; on `snapshot` replace, on `order` upsert; on 404 → `closed`).

Behaviour from the spec: kitchen page creates a room if the URL has no `?room=`, puts it in the URL, shows QR to `/table-order/menu?room=<id>&table=4` and "Open the menu here instead"; menu page has categories, item sheet with options, cart, KHQR step, status page; menu page offers "Open kitchen view"; closed room shows "This demo table has closed" + "Start a new demo". Copy and layout exactly per `docs/DESIGN.md`.

- [ ] **Step 1:** Implement. Run `npm run dev`, then screenshots of every screen at 390 and 1280 in both languages for the orchestrator.
- [ ] **Step 2:** Commit `feat: table order screens`.

### Task 7: Table Order end-to-end check — tier: light

**Files:** Create `tests/e2e/table-order.spec.ts`.

- [ ] **Step 1:** Test with two browser contexts: desktop opens `/table-order`, reads the QR link from the page (`data-menu-url` attribute), phone context opens it, switches to ខ្មែរ, adds 2 items with options, simulates payment; desktop shows the ticket in "New" within 1000 ms; desktop advances it twice; phone status shows "Ready". Second test: `/table-order/menu?room=doesnotexist&table=4` shows "This demo table has closed". Third: phone goes offline (`context.setOffline(true)`) for 3 s while kitchen advances; after reconnect phone shows the current status.
- [ ] **Step 2:** Run `npm run e2e` → PASS on both projects. Commit `test: table order e2e`.
- [ ] **Step 3 (orchestrator):** Review screenshots at 360, 390, 1280; then hand the owner the SSH tunnel command and URL to try it.

### Task 8: Shop Assistant domain — tier: careful

**Files:** Create `features/shop-assistant/{catalog.json,catalog.ts,km.ts,tools.ts,limits.ts}`, `tests/unit/shop-assistant/{tools,limits}.test.ts`.

**Interfaces — Produces:**
```ts
type Product = { id: string; name: Text; category: string; colors: { id: string; name: Text }[]; sizes: string[]; price: number; image: string; stock: Record<string, number> }  // stock key `${color}/${size}`
type Zone = { id: string; name: Text; price: number; sameDay: boolean }   // ~8 Phnom Penh zones, e.g. Toul Kork $1.50
searchProducts(q: { text?: string; category?: string; color?: string; size?: string; maxPrice?: number }): Product[]   // max 4 results
checkStock(productId: string, color?: string, size?: string): { inStock: boolean; qty: number; options: { color: string; size: string; qty: number }[] }
quoteDelivery(zone: string): { zone: Zone } | { error: "unknown_zone"; zones: string[] }
createOrder(o: { items: { productId: string; color: string; size: string; qty: number }[]; name: string; zone: string }): { id: string; lines: {...}[]; delivery: number; total: number }   // throws on out-of-stock or unknown ids
createLimiter(opts?: { perSession?: number; perIpDay?: number; globalDay?: number; maxChars?: number; now?: () => number }): { check(session: string, ip: string, text: string): { ok: true } | { ok: false; reason: "session" | "ip" | "global" | "length" }; countModelCall(): boolean }
```
Defaults: 20 per session, 60 per IP per day, `CHAT_GLOBAL_DAILY_CAP` (default 200 model calls per day), 300 characters. Days roll over at midnight Asia/Phnom_Penh. Catalog: ~20 products with Khmer and English names; matching normalises Khmer digits to Latin and is case-insensitive in both scripts.

- [ ] **Step 1:** `tools.test.ts`: searching Khmer "អាវ" + color black finds the black linen shirt; "size M" and "ទំហំ M" match the same results; `checkStock` with Khmer digit qty fixture; `quoteDelivery("toul kork")` → $1.50; unknown zone lists zones; `createOrder` total = items + delivery; out-of-stock throws.
- [ ] **Step 2:** `limits.test.ts`: 21st message in a session refused `session`; 61st from one IP refused `ip`; 301-char text refused `length`; `countModelCall` returns false after the global cap; counters reset after Phnom Penh midnight via injected `now`.
- [ ] **Step 3:** Run → FAIL. Implement. Run → PASS. Commit `feat: shop assistant domain`.

### Task 9: Chat engine and API — tier: careful

**Files:** Create `features/shop-assistant/{model,fake-model,gemini,agent,session,replay.json}.ts`, `app/api/chat/route.ts`, `tests/unit/shop-assistant/{agent,api}.test.ts`.

**Interfaces — Consumes:** Task 8. **Produces:**
```ts
type ChatTurn = { role: "user" | "assistant"; text: string };
type Card = { type: "product"; product: Product } | { type: "delivery"; zone: Zone } | { type: "order"; order: ReturnType<typeof createOrder> };
type ToolCall = { name: "search_products" | "check_stock" | "quote_delivery" | "create_order"; args: unknown };
interface ChatModel { next(history: ChatTurn[], toolResults: { call: ToolCall; result: unknown }[]): Promise<{ text: string } | { calls: ToolCall[] }> }
runTurn(history: ChatTurn[], model: ChatModel, opts?: { maxSteps?: number; timeoutMs?: number; onModelCall?: () => boolean }): Promise<{ text: string; cards: Card[] } | { error: "busy" }>   // maxSteps 4, timeout 15000
POST /api/chat  body { history: ChatTurn[] } → { text, cards } | 429 { error: reason, replay: true } | 503 { error: "busy", replay: true }
```
`createModel()` picks `FakeChatModel` when `CHAT_MODEL=fake` (scripted from `replay.json`, deterministic) else Gemini. System prompt (in `gemini.ts`): shop assistant for Mealea Fashion, reply in the customer's language, use tools for every product/stock/price/delivery fact, never invent products, stay on shop topics, never claim to be human, never ask for real payment details, keep replies under 80 words. Session: signed cookie `ra_s` (HMAC-SHA256 with `SESSION_SECRET`); IP from `cf-connecting-ip`, then first `x-forwarded-for`, then `"unknown"`. Server trims history to the last 12 turns and ignores any client-sent `cards`.

- [ ] **Step 1:** `agent.test.ts` with a stub model: tool calls execute and their results become cards; 5th step stops with what it has; model throwing → `{error:"busy"}`; model slower than `timeoutMs` → `busy`; `onModelCall` returning false → `busy`.
- [ ] **Step 2:** `api.test.ts` with `CHAT_MODEL=fake`: valid request → 200 with text; 301-char message → 429 `length` with `replay: true`; missing/forged cookie gets a new valid cookie; client-sent cards are ignored.
- [ ] **Step 3:** Run → FAIL. Implement (Gemini via `@google/genai`, mapping the four tools to function declarations). Run → PASS. Commit `feat: chat engine and API`.

### Task 10: Gemini spike — tier: medium, then orchestrator decision

Needs `GEMINI_API_KEY` in `.env.local` (owner provides; billing stays off). **Files:** Create `scripts/spike-gemini.ts`, `docs/SPIKE-GEMINI.md`.

- [ ] **Step 1:** Run 12 scripted conversations (6 Khmer, 4 English, 2 mixed) through `runTurn` with the real model; record replies, tool calls, latency, errors, and the current free-tier RPM/RPD for the chosen Flash model from Google's docs.
- [ ] **Step 1b (from the review):** pin a concrete model id (not `-latest`); set `thinkingConfig` for that model (`thinkingBudget` 0/low on 2.5, `thinkingLevel` LOW/MINIMAL on 3.x) with a matching `maxOutputTokens`; log `finishReason`, `usageMetadata.thoughtsTokenCount` and per-call latency; add a unit test (mocked `generateContent`) that the config is sent. Exit only when no reply is empty/truncated and a 2-tool turn fits well inside 15 s.
- [ ] **Step 2:** Orchestrator reads the transcripts. Pass = correct tool use in ≥ 11/12, natural Khmer in ≥ 5/6, median latency < 6 s. On fail: stop and ask the owner. On pass: set `CHAT_GLOBAL_DAILY_CAP` below the free daily limit, record it in the doc, commit `docs: gemini spike`.

### Task 11: Shop Assistant screens — tier: medium

**Files:** Create `app/shop-assistant/page.tsx` and components under `features/shop-assistant/ui/` per `docs/DESIGN.md`.

Behaviour from the spec: messenger-style chat, 3 bilingual suggestion chips, product / delivery / order cards (order card uses `KhqrCard`), typing state, limit/busy message with "Watch a sample chat" that replays `replay.json` with typing delays, "Demo: don't share personal information" note, How-it-works panel (beside chat ≥ 1024px, below on phones). Khmer text uses `overflow-wrap: anywhere` and the Khmer font.

- [ ] **Step 1:** Implement with `CHAT_MODEL=fake`. Screenshots at 360, 390, 1280 in Khmer and English for the orchestrator.
- [ ] **Step 2:** Commit `feat: shop assistant screens`.

### Task 12: Shop Assistant end-to-end check — tier: light

**Files:** Create `tests/e2e/shop-assistant.spec.ts` (runs with `CHAT_MODEL=fake`).

- [ ] **Step 1:** Tap a suggestion → a product card appears; continue to an order → `KhqrCard` visible with the right total; route `/api/chat` to return 503 → busy message and "Watch a sample chat" plays the replay; at 360px the page has no horizontal scroll (`scrollWidth <= 360`) with a long Khmer message.
- [ ] **Step 2:** Run `npm run e2e` → PASS. Commit `test: shop assistant e2e`.
- [ ] **Step 3 (orchestrator):** With the real key, chat in Khmer and English yourself; review; then hand the owner the URL to try.

### Task 13: Home page, SEO, accessibility — tier: medium

**Files:** Modify `app/page.tsx`, `app/layout.tsx`; create `app/robots.ts`, `app/sitemap.ts`, `app/opengraph-image.png` (or route).

- [x] **Step 1:** Home per `docs/DESIGN.md`: two large demo cards, link back to raevori.com. Metadata per page; `noindex` on any URL with `?room=`; sitemap lists `/`, `/table-order`, `/shop-assistant`. All animations off under `prefers-reduced-motion`. Every control keyboard-reachable with visible focus.
- [x] **Step 2:** e2e: home links to both demos; `robots.txt` and `sitemap.xml` respond 200; keyboard-only run through the menu → cart → pay works. Run all tests → PASS. Commit `feat: home, SEO, accessibility`.

### Task 14: Deploy — orchestrator + light

Needs owner: GitHub repo `ychetra/raevori-demos` with this server's deploy key, Coolify app at `demo.raevori.com` (Dockerfile), env `GEMINI_API_KEY`, `SESSION_SECRET`, `CHAT_GLOBAL_DAILY_CAP`.

- [ ] **Step 1:** Add Cloudflare DNS: `demo` CNAME → `raevori.com`, proxied (token in `~/.cf_token`).
- [ ] **Step 2:** Push on the owner's go-ahead; poll `https://demo.raevori.com/api/health` until `ok`.
- [ ] **Step 3:** Run the e2e suite against production (`BASE_URL=https://demo.raevori.com`), including that SSE events arrive through Cloudflare within 1000 ms. Fix buffering if not.

### Task 15: raevori.com integration — tier: medium (in `~/raevori-web`, design by orchestrator)

- [ ] **Step 1:** Add both demos to `WORK` in `lib/site.ts` with "Try the live demo" links; add case-study pages `/work/table-order` and `/work/shop-assistant` (problem, what it does, screenshots, try-it button); add to sitemap, `llms.txt`, JSON-LD.
- [ ] **Step 2:** `npx tsc --noEmit && npx next build` → success; screenshots at 390 and 1280 reviewed. Commit; push on owner's go-ahead; IndexNow ping for the new URLs.
