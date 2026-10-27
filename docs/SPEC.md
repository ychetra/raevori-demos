# Raevori portfolio demos: design

Status: draft, waiting for approval. Date: 2026-10-27.

## Why

Raevori Studio (raevori.com, Phnom Penh) sells apps, websites and KHQR payments. Clients believe what they can try, not what they read. These demos let a prospective client try a real product on their own phone in under a minute, and each one becomes a work card and case study on raevori.com.

Two demos, built in this order:

1. **Table Order**: QR menu, cart, KHQR checkout, live kitchen screen. Targets cafés, restaurants, bars, hotels.
2. **Shop Assistant**: an AI chat that sells for a shop in Khmer and English. Targets Facebook and Telegram sellers.

Both live in one app at **https://demo.raevori.com**, separate from raevori.com, because they need a server. raevori.com links to them.

## Success

- A visitor on a laptop opens Table Order, scans the QR with their phone, orders, "pays", and sees the ticket appear on the laptop's kitchen screen within a second.
- A visitor types any shopping question in Khmer or English and gets a correct, on-topic answer drawn from the shop's real catalog, ending in an order and a KHQR payment card.
- Both feel like finished products on a phone: fast, polished, no layout breaks at 360px wide.
- Running cost is $0 beyond the existing server.

## Non-goals (v1)

- Real payments. KHQR is simulated and labelled "Demo".
- Accounts, logins, admin panels, menu editing, databases.
- Shop Pulse (sales dashboard). Planned later; Table Order should keep its order data in a shape that dashboard can reuse.
- Real Telegram or Messenger bots. v1 is a web chat styled like a messenger, with a short "How it connects to Telegram / Messenger" panel.

## Anti-goals (would be a failure even if it works)

- One visitor seeing another visitor's orders or chat.
- The AI saying off-topic, offensive or made-up things (a visitor could screenshot it).
- The AI key reaching the browser, or a bill.
- Looking like a template: it must look like Raevori's own design.
- Decorative status dots, coloured bullets or "online" dots (the owner calls these AI slop). Functional map pins and form controls are fine.

## Constraints

- Stack matches raevori.com so it can share skills and style: Next.js 16 (App Router, running as a Node server, not static export), React 19, Tailwind 4, TypeScript, Geist font, Noto Sans Khmer for Khmer.
- Brand tokens copied from raevori-web `app/globals.css` (cream `#f4f1e8`, ink `#141a15`, green accent `#5f7d48`; dark mode `#0f1310` / `#a8c48f`). Light mode default.
- Deployed by Coolify from GitHub on push to `main`, Dockerfile build, single container. Must pass a health check on `127.0.0.1` (IPv6 `localhost` failed before on raevori-web).
- One container, so in-memory state is fine. No database in v1.
- Owner reviews all Khmer text before launch (native check).

## Demo 1: Table Order

### The flow

1. **Laptop** opens `/table-order`. It creates a private **demo room** (random id) and shows the kitchen screen plus a big QR code: "Scan to order from table 4".
2. **Phone** scans it and opens `/table-order/menu?room=<id>&table=4`: the customer menu for a sample café, **Lotus Coffee** (same brand as the sample site on raevori.com).
3. Customer switches EN / ខ្មែរ, browses categories, adds items with options (size, ice, sugar), sees the cart.
4. Checkout shows a **KHQR payment screen** (KHQR-style red card, QR, amount) with a "Simulate payment" button and a small "Demo, no money moves" note.
5. On payment, the phone shows an order status page (Received → Preparing → Ready) and the ticket appears **live** on the laptop's kitchen screen.
6. Kitchen screen: three columns (New / Preparing / Ready), ticket cards with table, items, options, time since order, paid badge. Tap to move a ticket forward; the phone's status page updates live.
7. If the visitor has only a phone, the menu page offers "Open kitchen view" in a second tab; if only a laptop, the QR area offers "Open the menu here instead".

### Rooms

- A room holds orders for one visitor's session; nobody else can see it. Expires 2 hours after last activity.
- Room ids are unguessable (at least 96 bits random).
- The kitchen screen starts with two pre-filled tickets so it never looks empty.
- No free-text fields in orders (only fixed options), so nothing offensive can be typed.
- Limits: 30 orders per room, 500 live rooms; oldest rooms are dropped first.

### Live updates

Server-Sent Events from a Next.js route handler, one stream per room, reconnecting automatically. In-memory store behind a small interface (`RoomStore`) so it can move to Redis or a database later.

### Menu content

About 14 items in 4 categories (Coffee, Tea, Bakery, Smoothies) with English and Khmer names, prices in USD with KHR shown small (rate 4,100), and item images. Images: generated illustrations or royalty-free photos, chosen during the design pass.

### Order data shape

Each order records: id, room, table, items (id, name, qty, options, unit price), total, payment method (KHQR), status, timestamps per status. This is the shape Shop Pulse will read later.

## Demo 2: Shop Assistant

### The flow

1. `/shop-assistant` shows a phone-style chat for a sample shop, **Mealea Fashion** (clothing and accessories), with a short intro and 3 tap-to-send suggestions in both languages (e.g. "Do you have this shirt in black, size M?", "តើមានកាបូបពណ៌ក្រហមទេ?").
2. The visitor types anything. The assistant replies in the language the visitor used (Khmer, English, or mixed).
3. Replies can include **product cards** (photo, name, price, sizes in stock), a **delivery quote** (Phnom Penh zones, fixed prices), and finally an **order summary + KHQR payment card** (simulated, same component as Table Order).
4. Beside the chat on desktop (below it on phone): a "How it works" panel showing the same assistant connected to Telegram and Messenger, and what the shop owner sees.

### AI

- Provider: **Google Gemini API, free tier** (a Flash model), called only from the server. Key in an environment variable in Coolify, never sent to the browser.
- Provider sits behind one small interface (`ChatModel`) so Claude or another model can replace it by changing one file.
- The model gets the shop's rules and uses tools rather than inventing facts: `search_products`, `check_stock`, `quote_delivery`, `create_order`. Catalog is about 20 products in a JSON file with Khmer and English names, sizes, colours, stock, prices.
- Stays on topic: politely declines anything not about the shop, never claims to be human, never collects real personal or payment details (orders use a made-up name the visitor can change).
- Each chat is private to the visitor's browser session; nothing is shown to other visitors.

### Abuse and cost guards

- Per session: 20 messages, 300 characters each. Per IP: 60 messages a day. Global: a daily cap set below the free tier limit.
- When any limit or the free tier is hit, the chat says so plainly and offers a short pre-recorded conversation to watch instead (replayed from a fixture), so the demo never looks broken.
- Free tier note: Google may use free-tier prompts to improve its models. Acceptable here because the data is a fake shop and visitor messages; the page says "Demo: don't share personal information".

## Shared

- Home page `/`: two large cards linking to the demos, Raevori branding, link back to raevori.com.
- Shared components: KHQR payment card, language toggle, phone frame for desktop viewing.
- Each demo page has a slim top bar: "A demo by Raevori Studio · Build one like this →" linking to raevori.com/#contact.
- `robots`: demos are indexable (home + the two demo pages); room and chat URLs are `noindex`.
- Accessibility: proper buttons and labels, focus states, `prefers-reduced-motion` respected.

## After both demos ship (separate tasks in raevori-web)

- Work cards for both on raevori.com linking to demo.raevori.com.
- A short case-study page per demo (problem, what it does, screenshots, "try it").
- Sitemap, llms.txt and JSON-LD updated; IndexNow ping.

## What the owner needs to provide

1. A private GitHub repo `ychetra/raevori-demos` with a deploy key from this server (write access).
2. A Coolify application for that repo at `demo.raevori.com` (Dockerfile build).
3. A Gemini API key from Google AI Studio (aistudio.google.com), added as `GEMINI_API_KEY` in Coolify.

Claude handles the DNS record for `demo.raevori.com` through Cloudflare.

## Decisions made by Claude (owner to check)

- **Gemini spike first.** Shop Assistant work starts with a short test of the chosen free Flash model: Khmer quality, tool calling and free-tier limits. If it is not good enough, stop and ask the owner before choosing a paid model. Billing must stay **off** on the Google project, so the free tier can never produce a bill.
- **Who a visitor is.** Trust `CF-Connecting-IP` (all traffic comes through Cloudflare) for per-IP limits, plus a signed session cookie for per-session limits. Counters live in memory; a restart resetting them is acceptable for a demo. The global daily cap is backed up by Google's own free-tier limit.
- **On-topic replies.** Strict system prompt, Gemini's safety settings at default or stricter, tools for every fact, replies capped in length. No share links or public transcripts, so no extra moderation layer in v1.
- **Room id is the only credential.** Anyone holding the QR can order into that room, and the kitchen URL contains the room id. Accepted: rooms are private, short-lived and contain only fixed menu options.
- **KHQR is a look-alike, not a real code.** The payment card uses KHQR's visual style, but its QR encodes a plain demo message (for example "Raevori demo, not a payment"), never a valid EMV/KHQR payload, so no banking app can treat it as a payment.
- **Images and names.** Fictional brands (Lotus Coffee, Mealea Fashion). Product images are generated illustrations or royalty-free photos with licences recorded in `docs/CREDITS.md`. All Khmer text sits in one translations file per demo so the owner can review it in one place.
- **Build before accounts exist.** Work starts locally with git and a dev server; checks run locally with Playwright. Pushing and deploying wait until the repo, Coolify app and key exist.

## Left to the builder

- File and folder layout, component breakdown, exact SSE implementation.
- Exact Gemini model name (pick the current free Flash model at build time and check its free-tier limits).
- Menu and catalog content within the brief above; image sourcing.
- Exact animations and micro-interactions, within the brand and the no-dots rule.
- Testing approach: at minimum, unit tests for the room store and AI tool functions, and a Playwright run of the phone-to-kitchen flow at 390px and 1280px.
