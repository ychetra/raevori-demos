import { describe, expect, test } from "vitest";
import { byDay, byHour, dailyReport, kpis, paymentSplit, topItems } from "@/features/shop-pulse/metrics";
import { PP_OFFSET_MS } from "@/features/shop-pulse/time";
import { fromOrder, type Sale } from "@/features/shop-pulse/types";
import { priceOrder } from "@/features/table-order/pricing";
import type { Order } from "@/features/table-order/types";

/** Epoch ms of a Phnom Penh wall-clock time. */
const pp = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - PP_OFFSET_MS;
const oct = (d: number, h = 0, min = 0) => pp(2026, 10, d, h, min);

let seq = 0;
type Cart = [itemId: string, qty: number, options?: Record<string, string>][];
// Menu prices: iced Khmer coffee 2.00, iced latte 2.25, americano 1.75, banana bread 1.75, iced lemon tea 1.75, large +0.50.
const sale = (at: number, cart: Cart, payment: Sale["payment"] = "khqr"): Sale => {
  const { lines, total } = priceOrder(cart.map(([itemId, qty, options = {}]) => ({ itemId, qty, options })));
  return { id: `T${++seq}`, table: 1, lines, total, payment, at };
};

describe("kpis", () => {
  const NOW = oct(28, 10, 0);
  const sales = [
    sale(oct(26, 20, 0), [["iced-latte", 4]]), // two days ago: ignored
    sale(oct(27, 7, 15), [["iced-latte", 1, { size: "large" }]]), // 2.75
    sale(oct(27, 9, 59), [["americano", 2]]), // 3.50
    sale(oct(27, 10, 1), [["iced-latte", 1]]), // yesterday after the same time: excluded
    sale(oct(28, 8, 0), [["iced-latte", 2]]), // 4.50 khqr
    sale(oct(28, 9, 30), [["americano", 1]], "cash"), // 1.75 cash
    sale(NOW, [["iced-khmer-coffee", 1]]), // 2.00 khqr, at now: included
    sale(NOW + 60_000, [["iced-latte", 1]]), // a minute in the future: excluded
  ];

  test("today runs from Phnom Penh midnight to now; yesterday is the same window a day earlier", () => {
    const k = kpis(sales, NOW);
    expect(k.today).toEqual({ revenue: 8.25, orders: 3, avg: 2.75 });
    expect(k.yesterday).toEqual({ revenue: 6.25, orders: 2, avg: 3.13 });
    expect(k.change.revenue).toBeCloseTo(0.32, 10);
    expect(k.change.orders).toBeCloseTo(0.5, 10);
    expect(k.change.avg).toBeCloseTo(-0.12, 10);
    expect(k.khqrShare).toBeCloseTo(650 / 825, 10);
  });

  test("change is null when yesterday had nothing", () => {
    const k = kpis(sales.filter((s) => s.at >= oct(28)), NOW);
    expect(k.yesterday).toEqual({ revenue: 0, orders: 0, avg: 0 });
    expect(k.change).toEqual({ revenue: null, orders: null, avg: null });
  });

  test("empty input gives zeros", () => {
    const k = kpis([], NOW);
    expect(k.today).toEqual({ revenue: 0, orders: 0, avg: 0 });
    expect(k.khqrShare).toBe(0);
    expect(k.change).toEqual({ revenue: null, orders: null, avg: null });
  });

  test("today down to zero from yesterday is -100%", () => {
    const k = kpis(sales.filter((s) => s.at < oct(28)), NOW);
    expect(k.change.revenue).toBe(-1);
    expect(k.change.orders).toBe(-1);
  });
});

describe("byHour", () => {
  const NOW = oct(28, 10, 30);
  const sales = [
    sale(oct(27, 10, 45), [["iced-latte", 2]]), // yesterday 10h: 4.50 (full hour counts)
    sale(oct(27, 20, 59), [["americano", 1]]), // yesterday 20h: 1.75
    sale(oct(28, 6, 30), [["americano", 1]]), // before opening: not in any row
    sale(oct(28, 7, 10), [["iced-latte", 1]]), // today 7h: 2.25
    sale(oct(28, 7, 50), [["americano", 1]]), // today 7h: 1.75
    sale(oct(28, 10, 5), [["iced-khmer-coffee", 1]]), // today 10h: 2.00
    sale(oct(28, 10, 45), [["iced-latte", 1]]), // after now: excluded
    sale(oct(28, 15, 0), [["iced-latte", 1]]), // future hour: excluded
  ];

  test("returns hours 7..20 with exact sums; today's future hours are 0", () => {
    const rows = byHour(sales, NOW);
    expect(rows.map((r) => r.hour)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const at = (h: number) => rows.find((r) => r.hour === h)!;
    expect(at(7)).toEqual({ hour: 7, today: 4, yesterday: 0 });
    expect(at(10)).toEqual({ hour: 10, today: 2, yesterday: 4.5 });
    expect(at(20)).toEqual({ hour: 20, today: 0, yesterday: 1.75 });
    for (const r of rows.filter((r) => r.hour > 10)) expect(r.today).toBe(0);
    expect(rows.reduce((a, r) => a + r.today, 0)).toBe(6);
    expect(rows.reduce((a, r) => a + r.yesterday, 0)).toBe(6.25);
  });
});

describe("byDay", () => {
  // 06:30 on 28 Oct in Phnom Penh is still 27 Oct in UTC.
  const NOW = oct(28, 6, 30);

  test("splits days at Phnom Penh midnight, oldest first, today last and partial", () => {
    expect(new Date(NOW).getUTCDate()).toBe(27);
    const sales = [
      sale(oct(14, 12), [["iced-latte", 1]]), // 15 days ago: outside 14 days
      sale(oct(15, 0, 0), [["americano", 1]]), // first minute of the oldest day
      sale(oct(27, 23, 59), [["iced-latte", 1]]), // 2.25 on the 27th
      sale(oct(28, 0, 1), [["americano", 1]]), // 1.75 on the 28th
      sale(oct(28, 6, 0), [["iced-khmer-coffee", 1]]), // 2.00 on the 28th
      sale(oct(28, 7, 0), [["iced-latte", 1]]), // after now: excluded
    ];
    const rows = byDay(sales, NOW);
    expect(rows.length).toBe(14);
    expect(rows[0]).toEqual({ start: oct(15), key: "2026-10-15", revenue: 1.75, orders: 1 });
    expect(rows[12]).toEqual({ start: oct(27), key: "2026-10-27", revenue: 2.25, orders: 1 });
    expect(rows[13]).toEqual({ start: oct(28), key: "2026-10-28", revenue: 3.75, orders: 2 });
    expect(rows.slice(1, 12).every((r) => r.revenue === 0 && r.orders === 0)).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i].start - rows[i - 1].start).toBe(24 * 60 * 60 * 1000);
  });

  test("respects a custom day count", () => {
    const rows = byDay([], NOW, 3);
    expect(rows.map((r) => r.key)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
  });
});

describe("topItems", () => {
  const from = oct(28);
  const to = oct(29);
  const sales = [
    sale(from, [["iced-latte", 2], ["americano", 1]]), // at `from`: included
    sale(oct(28, 9), [["iced-khmer-coffee", 2]]),
    sale(oct(28, 10), [["iced-latte", 1, { size: "large" }]]),
    sale(oct(28, 11), [["americano", 1]]),
    sale(oct(28, 12), [["lemon-tea", 1], ["banana-bread", 1]]),
    sale(to, [["cappuccino", 5]]), // at `to`: excluded
    sale(from - 1, [["cappuccino", 5]]), // before `from`: excluded
  ];

  test("ranks by qty, then revenue, then English name", () => {
    const top = topItems(sales, from, to);
    expect(top.map((t) => [t.itemId, t.qty, t.revenue])).toEqual([
      ["iced-latte", 3, 7.25],
      ["iced-khmer-coffee", 2, 4],
      ["americano", 2, 3.5],
      ["banana-bread", 1, 1.75],
      ["lemon-tea", 1, 1.75],
    ]);
    expect(top[0].name).toEqual({ en: "Iced latte", km: "ឡាតេទឹកកក" });
  });

  test("limits to n", () => {
    expect(topItems(sales, from, to, 2).map((t) => t.itemId)).toEqual(["iced-latte", "iced-khmer-coffee"]);
    expect(topItems([], from, to)).toEqual([]);
  });
});

describe("paymentSplit", () => {
  test("shares of revenue sum to 1; empty is 0/0", () => {
    const from = oct(28);
    const to = oct(29);
    const sales = [
      sale(oct(28, 8), [["iced-latte", 1]]), // 2.25 khqr
      sale(oct(28, 9), [["iced-latte", 1, { size: "large" }]]), // 2.75 khqr
      sale(oct(28, 10), [["americano", 1]], "cash"), // 1.75 cash
      sale(oct(28, 11), [["lemon-tea", 1]], "cash"), // 1.75 cash
      sale(to, [["iced-latte", 9]], "cash"), // excluded
    ];
    const split = paymentSplit(sales, from, to);
    expect(split.khqr).toBeCloseTo(500 / 850, 10);
    expect(split.cash).toBeCloseTo(350 / 850, 10);
    expect(split.khqr + split.cash).toBeCloseTo(1, 12);
    expect(paymentSplit([], from, to)).toEqual({ khqr: 0, cash: 0 });
    expect(paymentSplit(sales, oct(20), oct(21))).toEqual({ khqr: 0, cash: 0 });
  });
});

describe("dailyReport", () => {
  const sales = [
    sale(oct(26, 12), [["iced-khmer-coffee", 2, { size: "large" }]]), // 5.00 on the 26th
    sale(oct(27, 7, 30), [["iced-latte", 2]]), // 4.50 khqr
    sale(oct(27, 12), [["americano", 1]], "cash"), // 1.75 cash
    sale(oct(27, 20, 50), [["iced-khmer-coffee", 1]]), // 2.00 khqr
    sale(oct(28, 7), [["cappuccino", 9]]), // next day: excluded
  ];

  test("sums the day and compares with the previous full day", () => {
    const r = dailyReport(sales, oct(27));
    expect(r.key).toBe("2026-10-27");
    expect(r.revenue).toBe(8.25);
    expect(r.orders).toBe(3);
    expect(r.avg).toBe(2.75);
    expect(r.change).toBeCloseTo(0.65, 10);
    expect(r.best).toEqual({ name: { en: "Iced latte", km: "ឡាតេទឹកកក" }, qty: 2 });
    expect(r.khqrShare).toBeCloseTo(650 / 825, 10);
  });

  test("an empty day with an empty previous day", () => {
    expect(dailyReport(sales, oct(24))).toEqual({ key: "2026-10-24", revenue: 0, orders: 0, avg: 0, change: null, best: null, khqrShare: 0 });
  });
});

describe("fromOrder", () => {
  test("converts a Table Order order into a live KHQR sale that counts today", () => {
    const NOW = oct(28, 10, 0);
    const t = oct(28, 9, 55);
    const { lines, total } = priceOrder([{ itemId: "matcha-latte", qty: 1, options: {} }]);
    const order: Order = { id: "A10", room: "room1", table: 5, lines, total, payment: "khqr", status: "preparing", at: { new: t, preparing: t + 30_000 } };
    const s = fromOrder(order);
    expect(s).toEqual({ id: "A10", table: 5, lines, total: 2.75, payment: "khqr", at: t, live: true });

    const base = [sale(oct(28, 8), [["americano", 1]], "cash")];
    const k = kpis([...base, s], NOW);
    expect(k.today).toEqual({ revenue: 4.5, orders: 2, avg: 2.25 });
    expect(k.khqrShare).toBeCloseTo(275 / 450, 10);
  });
});
