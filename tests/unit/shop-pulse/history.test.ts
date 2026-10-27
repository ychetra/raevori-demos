import { describe, expect, test } from "vitest";
import { generateDay, history } from "@/features/shop-pulse/history";
import { dayKey, hourOf, PP_OFFSET_MS, startOfDay, weekday } from "@/features/shop-pulse/time";
import type { Sale } from "@/features/shop-pulse/types";
import { priceOrder } from "@/features/table-order/pricing";

const DAY = 24 * 60 * 60 * 1000;
/** Epoch ms of a Phnom Penh wall-clock time. */
const pp = (y: number, m: number, d: number, h = 0, min = 0) => Date.UTC(y, m - 1, d, h, min) - PP_OFFSET_MS;

const NOW = pp(2026, 10, 28, 15, 30); // Wednesday afternoon
const TODAY = startOfDay(NOW);
const ALL = history(NOW);
const FULL_DAYS = Array.from({ length: 28 }, (_, i) => generateDay(TODAY - (27 - i) * DAY));

const cents = (s: Sale) => Math.round(s.total * 100);

describe("time", () => {
  test("Phnom Penh is UTC+7", () => {
    expect(PP_OFFSET_MS).toBe(7 * 60 * 60 * 1000);
  });

  test("dayKey and startOfDay split at Phnom Penh midnight, not UTC midnight", () => {
    const lateNight = pp(2026, 10, 27, 23, 59);
    const earlyMorning = pp(2026, 10, 28, 0, 1); // still 27 Oct in UTC
    expect(new Date(earlyMorning).getUTCDate()).toBe(27);
    expect(dayKey(lateNight)).toBe("2026-10-27");
    expect(dayKey(earlyMorning)).toBe("2026-10-28");
    expect(startOfDay(earlyMorning)).toBe(pp(2026, 10, 28));
    expect(startOfDay(lateNight)).toBe(pp(2026, 10, 27));
    expect(startOfDay(pp(2026, 10, 28))).toBe(pp(2026, 10, 28));
  });

  test("hourOf and weekday use Phnom Penh time", () => {
    expect(hourOf(pp(2026, 10, 28, 0, 30))).toBe(0);
    expect(hourOf(pp(2026, 10, 28, 20, 59))).toBe(20);
    expect(weekday(pp(2026, 10, 28, 0, 30))).toBe(3); // Wednesday, though UTC says Tuesday
    expect(weekday(pp(2026, 10, 25, 12))).toBe(0); // Sunday
    expect(weekday(pp(2026, 10, 24, 12))).toBe(6); // Saturday
  });
});

describe("generateDay", () => {
  test("is deterministic for a day", () => {
    expect(generateDay(TODAY)).toEqual(generateDay(TODAY));
    // Any instant of the same day gives the same start, so the same history.
    expect(generateDay(startOfDay(NOW + 3 * 60 * 60 * 1000))).toEqual(generateDay(TODAY));
  });

  test("different days differ", () => {
    const a = generateDay(TODAY);
    const b = generateDay(TODAY - DAY);
    expect(a.map((s) => s.total)).not.toEqual(b.map((s) => s.total));
    expect(a[0].id).toMatch(/^H1028-/);
    expect(b[0].id).toMatch(/^H1027-/);
  });

  test("sales are sorted, inside 07:00-21:00 Phnom Penh, on their own day", () => {
    for (const day of FULL_DAYS) {
      const start = startOfDay(day[0].at);
      for (let i = 0; i < day.length; i++) {
        const s = day[i];
        if (i > 0) expect(s.at).toBeGreaterThanOrEqual(day[i - 1].at);
        expect(s.at).toBeGreaterThanOrEqual(start + 7 * 60 * 60 * 1000);
        expect(s.at).toBeLessThan(start + 21 * 60 * 60 * 1000);
        expect(hourOf(s.at)).toBeGreaterThanOrEqual(7);
        expect(hourOf(s.at)).toBeLessThanOrEqual(20);
      }
    }
  });

  test("ids, tables, lines and payments are well formed", () => {
    for (const day of FULL_DAYS) {
      const ids = new Set(day.map((s) => s.id));
      expect(ids.size).toBe(day.length);
      for (const s of day) {
        expect(s.id).toMatch(/^H\d{4}-\d{3}$/);
        expect(Number.isInteger(s.table) && s.table >= 1 && s.table <= 12).toBe(true);
        expect(s.lines.length).toBeGreaterThanOrEqual(1);
        expect(s.lines.length).toBeLessThanOrEqual(3);
        expect(["khqr", "cash"]).toContain(s.payment);
        expect(s.live).toBeUndefined();
      }
    }
  });

  test("every total comes from priceOrder", () => {
    for (const day of FULL_DAYS)
      for (const s of day) {
        const repriced = priceOrder(s.lines.map(({ itemId, qty, options }) => ({ itemId, qty, options })));
        expect(s.total).toBe(repriced.total);
        expect(s.lines).toEqual(repriced.lines);
      }
  });

  test("weekdays have 70-120 orders; weekends are busier on average", () => {
    const weekdayCounts: number[] = [];
    const weekendCounts: number[] = [];
    for (const day of FULL_DAYS) {
      const wd = weekday(day[0].at);
      (wd === 0 || wd === 6 ? weekendCounts : weekdayCounts).push(day.length);
    }
    expect(weekdayCounts.length).toBe(20);
    expect(weekendCounts.length).toBe(8);
    for (const n of weekdayCounts) {
      expect(n).toBeGreaterThanOrEqual(70);
      expect(n).toBeLessThanOrEqual(120);
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(weekendCounts)).toBeGreaterThan(avg(weekdayCounts));
  });

  test("KHQR is 70-90% of revenue over 28 days", () => {
    const sales = FULL_DAYS.flat();
    const total = sales.reduce((a, s) => a + cents(s), 0);
    const khqr = sales.filter((s) => s.payment === "khqr").reduce((a, s) => a + cents(s), 0);
    expect(khqr / total).toBeGreaterThan(0.7);
    expect(khqr / total).toBeLessThan(0.9);
  });

  test("iced latte or iced Khmer coffee is the top item by quantity", () => {
    const qty = new Map<string, number>();
    for (const s of FULL_DAYS.flat()) for (const l of s.lines) qty.set(l.itemId, (qty.get(l.itemId) ?? 0) + l.qty);
    const top = [...qty.entries()].sort((a, b) => b[1] - a[1])[0][0];
    expect(["iced-latte", "iced-khmer-coffee"]).toContain(top);
  });
});

describe("history", () => {
  test("covers the last 28 days ending today, sorted, nothing after now", () => {
    const keys = [...new Set(ALL.map((s) => dayKey(s.at)))];
    expect(keys.length).toBe(28);
    expect(keys[0]).toBe(dayKey(TODAY - 27 * DAY));
    expect(keys[27]).toBe("2026-10-28");
    for (let i = 1; i < ALL.length; i++) expect(ALL[i].at).toBeGreaterThanOrEqual(ALL[i - 1].at);
    expect(ALL.every((s) => s.at <= NOW)).toBe(true);
  });

  test("today is cut at now; earlier days are whole", () => {
    const today = generateDay(TODAY);
    const kept = ALL.filter((s) => s.at >= TODAY);
    expect(kept).toEqual(today.filter((s) => s.at <= NOW));
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(today.length);
    expect(ALL.filter((s) => s.at >= TODAY - DAY && s.at < TODAY)).toEqual(generateDay(TODAY - DAY));
  });

  test("respects a custom day count", () => {
    const week = history(NOW, 7);
    expect(new Set(week.map((s) => dayKey(s.at))).size).toBe(7);
    expect(week[0].at).toBeGreaterThanOrEqual(TODAY - 6 * DAY);
  });
});
