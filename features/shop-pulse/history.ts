import { MENU_BY_ID } from "@/features/table-order/menu";
import { priceOrder } from "@/features/table-order/pricing";
import type { CartLine } from "@/features/table-order/types";
import { DAY_MS, dayKey, HOUR_MS, startOfDay, weekday } from "./time";
import type { Sale } from "./types";

/** Share of a day's orders by Phnom Penh hour. Open 07:00-21:00: morning rush, lunch, a small after-work bump. */
const HOUR_WEIGHTS: [hour: number, weight: number][] = [
  [7, 9], [8, 10], [9, 8], [10, 4], [11, 5], [12, 8], [13, 8],
  [14, 5], [15, 3], [16, 3], [17, 5], [18, 5], [19, 3], [20, 2],
];

/** How often each menu item is picked for a line. Iced latte and iced Khmer coffee lead by a wide margin. */
const ITEM_WEIGHTS: [itemId: string, weight: number][] = [
  ["iced-khmer-coffee", 22], ["iced-latte", 20], ["americano", 8], ["cappuccino", 7], ["coconut-coffee", 8],
  ["matcha-latte", 6], ["jasmine-tea", 3], ["thai-tea", 6], ["lemon-tea", 5],
  ["mango-smoothie", 5], ["passion-smoothie", 3], ["dragon-smoothie", 3],
  ["butter-croissant", 6], ["banana-bread", 4],
];

const LINE_COUNT_WEIGHTS: [lines: number, weight: number][] = [[1, 60], [2, 30], [3, 10]];

/** mulberry32: a tiny seeded PRNG, uniform in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

function weighted<T>(rng: () => number, table: [T, number][]): T {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [value, w] of table) if ((r -= w) < 0) return value;
  return table[table.length - 1][0];
}

const int = (rng: () => number, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function pickOptions(rng: () => number, itemId: string): Record<string, string> {
  const options: Record<string, string> = {};
  for (const group of MENU_BY_ID.get(itemId)!.options) {
    if (group.id === "size") {
      options.size = rng() < 0.25 ? "large" : "regular";
      continue;
    }
    const others = group.choices.filter((c) => c.id !== group.default);
    options[group.id] = rng() < 0.75 || others.length === 0 ? group.default : others[Math.floor(rng() * others.length)].id;
  }
  return options;
}

function pickCart(rng: () => number): CartLine[] {
  const n = weighted(rng, LINE_COUNT_WEIGHTS);
  const ids = new Set<string>();
  while (ids.size < n) ids.add(weighted(rng, ITEM_WEIGHTS));
  return [...ids].map((itemId) => ({ itemId, qty: rng() < 0.85 ? 1 : 2, options: pickOptions(rng, itemId) }));
}

/** Every sale of the Phnom Penh day starting at `startMs`, sorted by time. Same day, same sales, for everyone. */
export function generateDay(startMs: number): Sale[] {
  const start = startOfDay(startMs);
  const key = dayKey(start);
  const rng = mulberry32(hash(`lotus:${key}`));
  const wd = weekday(start);
  const base = int(rng, 88, 102); // narrow, so two ordinary weekdays never differ by more than ~16%
  const count = wd === 0 || wd === 6 ? Math.round(base * 1.3) : base;

  const drafts = Array.from({ length: count }, () => {
    const hour = weighted(rng, HOUR_WEIGHTS);
    const at = start + hour * HOUR_MS + int(rng, 0, 3599) * 1000;
    const { lines, total } = priceOrder(pickCart(rng));
    const payment: Sale["payment"] = rng() < 0.8 ? "khqr" : "cash";
    return { table: int(rng, 1, 12), lines, total, payment, at };
  });
  drafts.sort((a, b) => a.at - b.at);

  const prefix = `H${key.slice(5, 7)}${key.slice(8, 10)}-`;
  return drafts.map((d, i) => ({ id: prefix + String(i + 1).padStart(3, "0"), ...d }));
}

/** The last `days` Phnom Penh days ending today, with today cut at `now`. Sorted by time. */
export function history(now: number, days = 28): Sale[] {
  const today = startOfDay(now);
  const out: Sale[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = generateDay(today - i * DAY_MS);
    out.push(...(i === 0 ? day.filter((s) => s.at <= now) : day));
  }
  return out;
}
