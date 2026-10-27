# Demo 4: Smart Queue (take a number from your phone)

Status: designed by Claude on 2026-10-28 while the owner was away (owner asked for more demo ideas); owner to review before launch.

## Why

Clinics, phone-repair shops, banks, service counters and busy restaurants in Phnom Penh still run queues with paper numbers and shouting. Customers can't leave without losing their place. Smart Queue lets a customer take a number by scanning a QR, walk away, and get told on their phone when it's their turn. It reuses the live-room engine from Table Order, so it is cheap to build and shows Raevori can do real-time systems for any counter business.

## Success

- A visitor on a laptop opens `/queue` and sees a waiting-room screen: big "Now serving", the next numbers, a QR "Scan to take a number".
- They scan, pick a service, get a number ("A-016 · 3 people ahead · about 6 min") and watch it count down live; when called, the phone shows "It's your turn · Counter 2" (and vibrates where supported).
- With only one device, "Take a number here instead" and auto-calling still show the whole loop in under a minute.

## Non-goals

Real SMS/Telegram sending, accounts, multiple branches, analytics (Shop Pulse covers dashboards).

## Flow

1. **Laptop `/queue`** creates a private room (same room rules as Table Order: unguessable id, 2 h expiry, per-IP creation limit). Left: eyebrow "Smart Queue demo", headline "Take a number from your phone. Leave the line.", QR card ("Scan to take a number", "No phone handy? Take one here"), three numbered steps. Right: the dark waiting-room board: shop name "Sokha Phone Repair", huge "Now serving A-012 → Counter 1", a second smaller "A-011 → Counter 2", "Next" list of the following 4 numbers, average wait. Staff bar under it: "Call next" (counter 1 / counter 2 buttons), "Auto-call every 20 s" switch (on by default, so a lone visitor sees movement), "Recall" on the current number.
2. **Phone `/queue/ticket?room=…`**: header with the shop name and EN/ខ្មែរ toggle; three service choices (Repair · Pick up · Payment, each with a short line and its letter prefix R/P/C); "Take a number". Then the ticket screen: big number, service, position ("3 people ahead"), estimated wait (position × average service time, rounded to minutes), a 4-step progress (Waiting → Almost (≤ 2 ahead) → Your turn → Done). When called: full-screen sage "It's your turn · Counter 2", vibrate([200,100,200]) when allowed, a "I'm on my way" button. "Leave the queue" link. A note: "Demo · We'd also send this on Telegram".
3. Rooms are seeded with 4 waiting tickets from made-up customers so the board is never empty; the first two counters are already serving.

## Data and server

- `features/queue/{types,store,km}.ts`: `Ticket = { id, room, number: string (e.g. "R-016"), service: "repair" | "pickup" | "payment", status: "waiting" | "called" | "done" | "left", counter?: 1 | 2, at: Partial<Record<status, number>> }`. Store like `features/table-order/store.ts` (RoomStore pattern: create/get/take/call/recall/leave/subscribe/sweep, max 500 rooms, 60 tickets per room, 2 h TTL, isolated emit). Numbers per service prefix, sequential per room.
- API: `POST /api/queues` (per-IP limited), `GET /api/queues/:id`, `POST /api/queues/:id/tickets` `{service}`, `POST /api/queues/:id/call` `{counter}`, `POST /api/queues/:id/tickets/:tid/leave`, `GET /api/queues/:id/events` (SSE: snapshot first, then ticket events, 20 s ping, closed on expiry). Auto-call runs client-side on the board (calls next every 20 s while the switch is on and the tab is visible), so the server stays passive.
- Estimated wait = people ahead × 3 min (fixed demo service time), shown as "about N min".

## Tasks

- **19 Queue domain + API (careful):** store + routes + unit tests (numbering, positions, call order across counters, leave, expiry, isolated emit, per-IP creation limit, SSE snapshot first).
- **20 Queue screens (medium):** board + phone + home card + raevori.com later; screenshots 360/390/1280 EN+KM.
- **21 Queue e2e (light):** two contexts: take a number on the phone, board shows it within 1000 ms, call next until it's the phone's turn, phone shows "It's your turn · Counter N"; closed room screen; offline catch-up.
