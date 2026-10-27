# Demo 3: Shop Pulse (sales dashboard)

Status: designed by Claude on 2026-10-28 while the owner was away (owner asked for more demos); owner to review. Builds on `docs/SPEC.md` ("Shop Pulse… planned later; Table Order keeps its order data in a shape that dashboard can reuse").

## Why

Every café or shop owner asks the same thing at 3 pm: "How is today going?" Shop Pulse answers it on one screen and in a Telegram message at closing time. It sells Raevori's dashboard and reporting work, and it closes the loop on Table Order: a visitor scans, orders, pays, and watches the sale land in the numbers.

## Success

- A visitor opens `/shop-pulse`, scans the QR with their phone, orders a drink, and sees today's sales, order count, the hourly bar and the live feed update within a second.
- With no phone handy, the numbers still look like a real, busy café (28 days of believable history).
- It reads well at 360px and on a laptop, in English and Khmer.

## Non-goals

Real accounts, editing data, exports, date pickers beyond the fixed views, real Telegram sending.

## Data

- Café: Lotus Coffee (same menu as Table Order, `features/table-order/menu.ts`). Prices come from `priceOrder`, never invented.
- History: 28 days of orders generated deterministically (seeded PRNG keyed by the Phnom Penh date), so every visitor sees the same numbers and reloads are stable. Open 07:00–21:00 Phnom Penh time; morning peak 7–9, lunch peak 12–14, small 17–18 bump; weekends about +30%; ~70–120 orders a day; 1–3 lines per order from the menu with realistic options; ~80% KHQR, ~20% cash. Today's history only includes orders up to "now".
- Shape: `Sale = Omit<Order, "payment" | "room"> & { payment: "khqr" | "cash"; at: { new: number } }` (Table Order's `Order` lines/total, so a live room order converts 1:1).
- Live: the page owns a Table Order room (creates one if the URL has no `?room=`, same as the kitchen page) and subscribes with `useRoom`. Room orders count as today's sales (paid by KHQR) at their `at.new` time, merged with history. The Kitchen page links to `/shop-pulse?room=<id>` ("See today's sales →"), and Shop Pulse links back to the kitchen for the same room.

## Metrics (pure functions, all money in cents internally)

- `kpis(sales, now)`: today's revenue, orders, average order; same-time-yesterday values; percentage change for each (null when yesterday is 0).
- `byHour(sales, now)`: for hours 7..20, today's revenue and yesterday's revenue (full hour).
- `byDay(sales, now, days = 14)`: revenue per day, oldest first, today last (partial).
- `topItems(sales, from, to, n = 5)`: by quantity, with revenue; ties by revenue then name.
- `paymentSplit(sales, from, to)`: KHQR vs cash share of revenue.
- `dailyReport(sales, day)`: the numbers for yesterday's Telegram report.

## Screen (`/shop-pulse`)

DemoBar on top. Container 1240px. Light theme, cream page, surface cards (radius 18–20px, border line).

1. Intro row: eyebrow "Shop Pulse demo" (sage), H1 "Know how today is going, from your phone." (30–36px, tight tracking), sub "Live sales for Lotus Coffee: every KHQR payment, best sellers and busy hours." EN/ខ្មែរ toggle at the right of the dashboard header (switches all dashboard copy; numbers stay Latin digits; riel shown small under dollars).
2. KPI row (4 stat tiles; 2×2 on phones): Sales today ($ big 28–32px + riel small), Orders, Average order, KHQR share (meter: sage fill on a line-coloured track, % as text). Under each value: change vs the same time yesterday as text, e.g. "▲ 12% vs same time yesterday" (ink text, triangle glyph, no red/green colouring; "—" when not comparable).
3. "Sales by hour" (2/3 width on desktop): column chart 07–20. Today = sage bars (4px rounded tops, 2px gaps); yesterday = a thin step line in `line-strong` grey over the same hours (emphasis form). Legend row above the plot: "Today" (sage swatch) and "Yesterday" (grey line). Current hour bar is labelled with its value. Hover/tap on any hour → tooltip "13:00–14:00 · Today $48.50 · Yesterday $52.00". Recessive grid (3 horizontal lines, muted labels, $ ticks).
4. "Best sellers today" (1/3): top 5 horizontal bars (sage), item name (bilingual) left, "×31 · $69.75" right, bar length by quantity.
5. "Last 14 days" (2/3): column chart, sage; today's bar outlined/hatched lighter with the label "Today so far"; tooltip per day "Tue 21 Oct · $412.50 · 92 orders".
6. "Live orders" (1/3): newest first, 6 rows: time (HH:MM), "Table 4", items summary (muted), total, "KHQR"/"Cash" text tag. A new live order slides in with the soft sage outline used by the kitchen ticket (motion off under reduced motion). Above the list, a small QR card: "Scan to order and watch it land here" + "Open the menu here instead" link (same room) + "Kitchen view →".
7. Ink panel "What the owner gets on Telegram at 9 pm": a message bubble with yesterday's real `dailyReport` numbers: "Lotus Coffee · Mon 27 Oct / Sales $412.50 (▲ 8%) / 92 orders · average $4.48 / Best seller: Iced latte ×31 / KHQR 78% · Cash 22%".

Every chart has an sr-only data table and an `aria-label` summary. No status dots, no coloured bullets, no dual axes, no pie charts.

## Home and raevori.com

- Home gets a third card, "Shop Pulse" ("Live sales, best sellers and a 9 pm Telegram report. For any shop that takes KHQR."), preview: a mini KPI tile + 7 sage bars on paper.
- raevori.com work card + case study: later, same pattern as the first two.

## Tasks

- **16 Shop Pulse domain (careful):** `features/shop-pulse/{types,history,metrics,km}.ts` + `tests/unit/shop-pulse/*.test.ts`. Tests: same date → same history; no history after `now`; open hours only; totals equal `priceOrder` of the lines; weekend busier than weekday on average; kpis/byHour/byDay/topItems/paymentSplit on hand-built fixtures (exact cents); a room `Order` converts to a `Sale` and is counted; Phnom Penh day boundaries.
- **17 Shop Pulse screens (medium):** page, components under `features/shop-pulse/ui/`, kitchen link, home third card; screenshots 360/390/1280 EN+KM.
- **18 Shop Pulse e2e (light):** order posted to the page's room shows in the live feed and raises "Orders" within 1000 ms; tooltip appears on hover; no horizontal scroll at 360px in Khmer.
