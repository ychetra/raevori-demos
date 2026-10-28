# Shop owner admin (all demos)

Status: the owner asked on 2026-10-28 to make the demos work "like a real system" and chose "Shop owner admin" first. Designed by Claude; owner to review.

## Why

The demos show the customer side and a staff screen, but a real shop owner's first question is "Can I change my menu and prices myself? Can I see yesterday's orders?" A small admin per demo answers it and makes each one feel like a product, not a mock-up.

## Principles

- **Same sandbox:** each laptop visitor's room is still their private shop. Admin edits change only that room and expire with it (2 h), so visitors can't vandalise each other's demo.
- **Real enforcement on the server:**
  - Sold-out items can't be ordered.
  - Prices come from the room's menu.
  - Bookings respect the room's hours and stylists' days off.
  - The client is never trusted.
- **Live everywhere:** an admin change reaches the customer's phone and the staff screen within a second, over the room's existing event stream.
- **PIN login like a real shop tablet:**
  - Each room has a 4-digit staff PIN, shown on the laptop page as "Owner admin · PIN 4821". The PIN is random per room, never a fixed 1234.
  - Logging in sets an HttpOnly, signed, room-scoped cookie (reuse the HMAC in `features/shop-assistant/session.ts`, moved to `lib/` if shared). It lasts 2 h.
  - Wrong PINs are limited to 5 per room per 10 min. After that the answer is 429 and the login says "Too many tries, wait a few minutes".
  - Every admin mutation checks the cookie; without it, the answer is 401.
- **Phone first:** owners run their shop from a phone. The admin works at 360px; the laptop gets a wider two-column layout.
- **Khmer and English throughout:** all strings go in each demo's `km.ts`.

## Café admin (Table Order and Shop Pulse) — `/table-order/admin?room=…`

Reached from the Kitchen page ("Owner admin →") and from Shop Pulse.

1. **Menu.** Items grouped by category. Each row shows the art, the name, the price and a "Sold out" switch. Tap a row to edit:
   - name EN/KM, short note EN/KM, price, category, and option price deltas;
   - hide from the menu.
   - "Add item": name EN/KM, price, category. The art comes from the category's style (a cup in a chosen colour, or a pastry).

   Customers see changes live:
   - A sold-out item is greyed out with "Sold out" and can't be added to the cart.
   - A cart line that becomes sold out shows a notice before payment.
   - A new price shows immediately. The server prices the order at submit time; if the total changed, the phone says "Prices changed, check your total" before paying.
2. **Orders.** Every order in the room, newest first:
   - filter by status (New, Preparing, Ready, Done) and search by table or item;
   - order detail shows the lines, options, total, payment and timeline;
   - actions: mark Done (collected), Cancel (with a reason; the customer's phone shows "Order cancelled", and it no longer counts in Shop Pulse);
   - the kitchen board drops Done and Cancelled orders.
3. **Export.** "Download orders (Excel)": a CSV with a UTF-8 BOM, so Khmer opens correctly in Excel. Columns: date, time, order no., table, items, total USD, total KHR, payment, status.
4. **Shop settings.**
   - Café name, shown on the menu, the kitchen and the KHQR card.
   - Number of tables (1–50).
   - Opening hours (open/close). Outside the hours the phone menu says "We're closed · opens 7:00" and can't order.
   - "Reset demo shop" restores the default menu and settings.

Data and server:
- The room gets `menu: MenuItem[]` (a copy of the default `MENU` on create, plus `soldOut`/`hidden` flags) and `settings`.
- `priceOrder(lines, menu)` takes the room menu.
- New room events:
  - `{type:"menu", menu}`
  - `{type:"settings", settings}`
  - `{type:"order"}` also carries `done`/`cancelled`
- New routes under `/api/rooms/:id/admin/...`: `login`, `menu` (PUT item / POST new item), `orders/:oid` (PATCH status), `settings`, `export.csv`, `reset`.
- Caps:
  - 60 menu items per room;
  - name ≤ 40 chars, note ≤ 120;
  - price 0.25–100 in 0.25 steps.

Shop Pulse:
- Cancelled live orders don't count.
- The Telegram card uses the room's café name.

## Salon admin (Booking) — `/booking/admin?room=…`

Same PIN pattern.

- **Services:** price, duration (30/60/90/120), and hide. New bookings use them. Existing bookings keep their own.
- **Staff:**
  - each stylist's days off and working hours, which `availability` respects;
  - add a stylist, up to 5 (column width permitting).
- **Bookings:**
  - list by day with filters;
  - cancel a booking with a reason, choosing "refund deposit" or "keep deposit";
  - move a booking to another free time; the customer's confirmation page updates.
- **Export:** bookings CSV.
- **Settings:** salon name, opening hours, deposit amount ($0–10).

## Queue admin — `/queue/admin?room=…`

Same PIN pattern.

- **Services:** name, letter prefix, average service minutes (used for "about N min"), and hide.
- **Counters:** 1–4, each with a name such as "Counter 2" or "Window B"; open or closed.
- **History:** served, average wait and longest wait today, and a list of tickets with their times.
- **Export:** tickets CSV.
- **Settings:** shop name, and auto-call interval (off/20 s/60 s, used by the board).

## Non-goals

Real accounts or passwords, multiple staff roles, image upload for menu items, real persistence beyond the room's 2 h, and inventory counts. A "Sold out" switch is enough.

## Tasks

- **25 Café admin domain and API (careful):** room menu and settings, priceOrder on the room menu, PIN login, admin routes, sold-out enforcement, cancel/done, CSV export, unit tests.
- **26 Café admin screens (medium):** the admin screens; the phone menu shows sold-out, closed and price-changed states; the kitchen link and PIN. Screenshots at 360/390/1280 in EN and KM.
- **27 Café admin e2e (light):**
  - The admin marks an item sold out and the phone shows it within 1 s.
  - A price change is used at checkout.
  - Cancelling an order notifies the phone and drops it from the kitchen.
  - Export downloads a CSV with a BOM.
  - A wrong PIN 6 times gives 429.
- **28 Salon admin (careful, domain + API + screens),** with e2e.
- **29 Queue admin (medium, domain + API + screens),** with e2e.
