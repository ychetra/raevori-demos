# Approved design (v1, approved by the owner 2026-10-27)

The visual source of truth is `docs/design/design-v1.png` (rendered) and `docs/design/design-v1.html` (the mockup markup, with exact colours, sizes and copy). Build to match it; this file lists the decisions in words.

## Global

- Tokens: `app/globals.css` (cream bg, surface, line, ink fg, muted, sage accent; dark "ink" set for kitchen and owner panels; `khqr` red `#e1232e`).
- Type: Geist; Khmer runs use Noto Sans Khmer via `lang="km"`. Headlines semibold with tight tracking (−0.03 to −0.05em). Body 12–14px inside phone screens, 13–15px on desktop.
- Radii: phone screens 31px inside a 38px frame; cards 14–22px; buttons 14px; chips fully round; option pills 10px.
- Every demo page starts with the **DemoBar**: ink background, "A live demo by **Raevori Studio**" left, "Build one like this →" right in sage, linking `https://raevori.com/#contact`.
- On desktop, phone-sized UIs sit inside a **PhoneFrame** (ink bezel, soft shadow). On phones the UI is full-bleed with no frame.
- No decorative dots anywhere (no status dots, no bouncing typing dots). Colour swatches are small rounded squares.
- Motion: new kitchen ticket slides in and gets a soft sage outline glow; "Checking stock…" text shimmer; nothing else. All motion off under `prefers-reduced-motion`.

## Table Order

**Kitchen page (`/table-order`, ≥ 1024px):** two columns, 330px left + flexible right.
- Left: eyebrow "Table Order demo" (sage), headline "Order from your phone. Watch it land in the kitchen.", QR card ("Scan to order from Table 4", "Camera app or any QR scanner", divider, "No phone handy? Open the menu here"), then 3 numbered steps (1 Scan and pick a drink · 2 Pay with KHQR (demo, no money moves) · 3 Your ticket appears here instantly). Number badges are ink squares with white numbers.
- Right: dark kitchen board. Header "Lotus Coffee · Kitchen", date/time under it, stats right ("Today N orders", "Avg wait Nm"). Three columns NEW / PREPARING / READY with counts. Ticket: table name bold, age right ("just now" sage, or m:ss), item lines with options muted beneath, "Paid · KHQR" + total, action button (NEW: filled sage "Start preparing"; PREPARING: outline "Mark ready"; READY: no button, card at 75% opacity, "Ready" in sage).
- Below 1024px the left column stacks above the board.

**Customer phone (`/table-order/menu`):**
- Menu: green gradient header (`#5f7d48 → #24311d`) with "Table 4" pill, EN/ខ្មែរ segmented toggle, café name "Lotus Coffee", tagline. Sticky category chips (Coffee, Tea, Smoothies, Bakery; active chip ink). Item rows: 58px illustrated thumbnail tile, name bold, price muted, "+" square button (shows quantity in an ink square once added). Sticky ink cart bar at bottom: "N items · $X" and "View cart →".
- Item sheet: bottom sheet over a dimmed menu; thumbnail + name + "$2.25 · ៩,២២៥៛"; option groups as pills (Size: Regular / Large +$0.50; Ice: Normal / Less / None; Sugar: 100% / 70% / 50% / 0%); quantity stepper and ink "Add · $X" button.
- Cart: "Your order" + table, lines with options, subtotal, total with riel beneath, red "Pay with KHQR · $X", note "Any Cambodian bank app. Demo, no money moves."
- KHQR: `KhqrCard` (red header with "KHQR" and the cut corner, merchant, amount + USD, dashed divider, QR), ink "Simulate payment" button, "Demo, no money moves".
- Status: sage check tile, "Paid. The kitchen has it." (changes to "Ready! Pick it up at the counter." when ready), order code · table · total, 3-segment progress (Received / Preparing / Ready), items summary, footer "Updates live. Open kitchen view".
- Closed room: "This demo table has closed" + "Start a new demo".

**Illustrations:** flat SVG drinks and pastries in the brand palette (cup with lid and colored fill; croissant), on soft tinted tiles. No photos.

## Shop Assistant (`/shop-assistant`)

- Desktop (≥ 1024px): left text column + 330px phone-framed chat on the right. Left: eyebrow "Shop Assistant demo", headline "A salesperson that never sleeps, in Khmer and English.", sub copy, three channel cards (Telegram, Messenger, Your website), then an ink panel: "What the owner gets on Telegram" (sample order message) and "Built in" list.
- Phone: chat full screen, the left-column content follows below the chat.
- Chat header: "M" sage gradient tile, "Mealea Fashion", "AI assistant · replies instantly", EN/ខ្មែរ toggle (switches UI copy and suggestion chips only; the AI always answers in the customer's language).
- Bubbles: customer ink (right), assistant paper (left). Cards inside assistant bubbles: product card (image, name, price, colour swatches with the selected one outlined, sizes), order card (lines, delivery, total, red "Pay with KHQR" opening `KhqrCard`).
- First open: greeting bubble, "TRY ASKING" label, three suggestion chips. Composer: rounded field "Message Mealea Fashion…", ink send button, footnote "Demo · Don't share personal information".
- Waiting: assistant bubble with shimmering "Checking stock…".
- Busy/limit: centered card "The demo is busy right now" + reason line + ink "Watch a sample chat" + "Want one for your shop? Talk to Raevori".

## Home (`/`)

DemoBar variant ("Raevori Studio · live demos", "raevori.com →"). Headline "Don't read about it. Try it on your phone.", sub "Two real products built by Raevori Studio in Phnom Penh. Both work in Khmer and English." Two cards with live-looking previews (Table Order on green, Shop Assistant on paper), title + "Try it →" + one-line description.
