# Demo 5: Booking with a deposit (salon)

Status: designed by Claude on 2026-10-28 while the owner was away (owner asked for more demo ideas); owner to review before it is built or launched.

## Why

Salons, spas, clinics and barbers in Phnom Penh take bookings by Facebook message and phone, then lose 1 in 5 slots to no-shows. A booking page with a small KHQR deposit fixes both: customers book themselves at midnight, and a no-show costs them the deposit. The demo shows Raevori can build booking systems with payments and a live staff calendar.

## Success

- A visitor on a laptop opens `/booking` and sees the salon's day: three stylists in columns, half-hour rows from 9:00 to 19:00, about half the slots already booked.
- They scan the QR, pick a service, a stylist (or "Anyone"), a day and a free time, pay a $3 deposit (simulated KHQR), and see the booking land on the laptop calendar within a second.
- Two phones can't book the same slot: a slot is held for 5 minutes while one of them pays, and shows as "Being booked" to the other.
- It works with one device ("Book here instead"), and at 360px in English and Khmer.

## Non-goals

Real payments, accounts, SMS or Telegram sending, cancellation by the customer, recurring bookings, multiple branches.

## Salon

Bopha Beauty, open 9:00–19:00 Phnom Penh time, every day. Stylists: Bopha, Dara, Srey Leak. Services, each with a duration and a price (pay the rest at the salon):
- Haircut, 30 min, $8
- Hair wash and blow dry, 30 min, $6
- Hair colour, 90 min, $35
- Manicure, 60 min, $12
- Facial, 60 min, $20

Deposit: $3 for every booking, kept on a no-show.

## Flow

1. **Laptop `/booking`** creates a private room. This uses the same room rules as Table Order: an unguessable id, 2 h expiry and the per-IP creation limit.
   - **Left:** eyebrow "Booking demo", headline "Bookings with a deposit. No more no-shows.", the QR card ("Scan to book", "No phone handy? Book here instead") and three steps.
   - **Right:** the salon calendar for one day, with a date switcher (today plus the next 6 days). Each booking is a block showing the customer's first name and the service, and "Deposit paid".
   - Staff can tap a booking to mark "Arrived" or "No-show". A no-show block shows "Deposit kept $3".
   - New bookings land with a short highlight. Held slots show as striped "Being booked".
2. **Phone `/booking/book?room=…`** goes through four steps:
   1. Service.
   2. Stylist, or "Anyone": the first stylist free at the chosen time.
   3. Day and time: free start times only. A start is free when the whole duration fits before 19:00 and no booking or hold overlaps it.
   4. Name and phone. The phone number is free text, never validated against a real network and never stored beyond the room.
   - Then the "Pay $3 deposit" screen. It shows the simulated KHQR, whose QR value is always `Raevori demo, not a payment` (never a real KHQR/EMV payload), with a "Simulate payment" button and a 5-minute countdown for the hold.
   - Then the confirmation: date, time, stylist, service, "Deposit $3 paid · pay $X at the salon", "We'd send a reminder on Telegram the day before", and "Add to calendar" (an .ics download).
3. Rooms are seeded with bookings from made-up customers for today and tomorrow, about 50% of slots. Today's bookings before the current time are marked "Arrived", with one "No-show".

## Data and server

- `features/booking/{types,salon,availability,store,server,api,useBooking,km}.ts`.
- `Booking = { id, room, service, stylist, start: number, end: number, name, status: "held" | "booked" | "arrived" | "noshow" | "expired", holdUntil?: number, at: Partial<Record<status, number>> }`.
- `availability(bookings, service, stylist | "any", day, now)` is pure. It returns the free start times in 30-minute steps, never in the past, and treats held and booked slots as taken. A hold whose `holdUntil` has passed counts as free. Tested hard: overlaps, the 90-minute colour near closing, "Anyone", a hold expiring, the day boundary in UTC+7.
- `POST /api/bookings` creates a room. `GET /api/bookings/:id` returns it.
  - `POST /api/bookings/:id/holds {service, stylist, start, name}` returns 201 with the hold. It answers 409 `taken` when the slot is no longer free, and the server re-checks with `availability`.
  - `POST /api/bookings/:id/holds/:hid/pay` turns the hold into a booking (simulated). It answers 410 when the hold has expired.
  - `POST /api/bookings/:id/:bid/status {arrived|noshow}`.
  - `GET /api/bookings/:id/events` is the SSE stream: snapshot first, a 20 s ping, closed on expiry.
- Holds expire lazily (checked on read and in `availability`). A sweep emits `expired` events so calendars clear the stripes.
- Room caps: 200 bookings per room, max 500 rooms, isolated emit, the per-IP creation limit (same as the queue).

## Tasks

- **22 Booking domain and API (careful):** salon data, availability, store, routes, unit tests.
- **23 Booking screens (medium):** calendar board, phone flow, the home card; screenshots at 360/390/1280 in EN and KM.
- **24 Booking e2e (light):** two phones race for one slot and only one wins; a booking lands on the calendar within 1000 ms; a hold expires (fake clock); no-show shows "Deposit kept".
