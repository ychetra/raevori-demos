import type { Text } from "@/lib/i18n";
import { CLOSE_HOUR, DAY_MS, dayKey, HOUR_MS, OPEN_HOUR, tradingDayStart } from "./time";
import type { Sale } from "./types";

// Everything sums in integer cents; dollars appear only on the way out.
export type Kpi = { revenue: number; orders: number; avg: number };
type Sums = { cents: number; orders: number; khqrCents: number };

const centsOf = (s: Sale) => Math.round(s.total * 100);
const dollars = (cents: number) => Math.round(cents) / 100;
const share = (part: number, whole: number) => (whole === 0 ? 0 : part / whole);
const change = (now: number, before: number) => (before === 0 ? null : (now - before) / before);

/** Sales with `from <= at < to`. */
const inRange = (sales: Sale[], from: number, to: number) => sales.filter((s) => s.at >= from && s.at < to);

function sum(sales: Sale[]): Sums {
  let cents = 0;
  let khqrCents = 0;
  for (const s of sales) {
    const c = centsOf(s);
    cents += c;
    if (s.payment === "khqr") khqrCents += c;
  }
  return { cents, orders: sales.length, khqrCents };
}

const avgCents = (t: Sums) => (t.orders === 0 ? 0 : t.cents / t.orders);
const kpi = (t: Sums): Kpi => ({ revenue: dollars(t.cents), orders: t.orders, avg: dollars(avgCents(t)) });

/** Today (the trading day, 07:00 to 07:00) so far against the same window yesterday ("same time yesterday"). Changes are fractions: 0.12 = +12%. */
export function kpis(sales: Sale[], now: number) {
  const start = tradingDayStart(now);
  // Both windows include their end instant: [start, now] and [start - 1 day, now - 1 day].
  const today = sum(inRange(sales, start, now + 1));
  const yesterday = sum(inRange(sales, start - DAY_MS, now - DAY_MS + 1));
  return {
    today: kpi(today),
    yesterday: kpi(yesterday),
    change: {
      revenue: change(today.cents, yesterday.cents),
      orders: change(today.orders, yesterday.orders),
      avg: change(avgCents(today), avgCents(yesterday)),
    },
    khqrShare: share(today.khqrCents, today.cents),
  };
}

export type HourRow = { hour: number; today: number; yesterday: number; late?: true };

/**
 * Revenue per opening hour (7..20) of the trading day: today up to `now`, yesterday in full.
 * A last row `{ hour: 21, late: true }` covers 21:00 to 07:00, only when today or yesterday sold in that window.
 */
export function byHour(sales: Sale[], now: number): HourRow[] {
  const start = tradingDayStart(now);
  const todaySales = sales.filter((s) => s.at <= now);
  const row = (hour: number, from: number, to: number) => ({
    hour,
    today: dollars(sum(inRange(todaySales, from, to)).cents),
    yesterday: dollars(sum(inRange(sales, from - DAY_MS, to - DAY_MS)).cents),
  });
  const rows: HourRow[] = [];
  for (let hour = OPEN_HOUR; hour < CLOSE_HOUR; hour++) {
    const from = start + (hour - OPEN_HOUR) * HOUR_MS;
    rows.push(row(hour, from, from + HOUR_MS));
  }
  const late = row(CLOSE_HOUR, start + (CLOSE_HOUR - OPEN_HOUR) * HOUR_MS, start + DAY_MS);
  if (late.today > 0 || late.yesterday > 0) rows.push({ ...late, late: true });
  return rows;
}

/** Revenue and orders per trading day (07:00 to 07:00, keyed by the date of its 07:00), oldest first; today (last) counts up to `now`. */
export function byDay(sales: Sale[], now: number, days = 14): { start: number; key: string; revenue: number; orders: number }[] {
  const today = tradingDayStart(now);
  const upToNow = sales.filter((s) => s.at <= now);
  return Array.from({ length: days }, (_, i) => {
    const start = today - (days - 1 - i) * DAY_MS;
    const t = sum(inRange(upToNow, start, start + DAY_MS));
    return { start, key: dayKey(start), revenue: dollars(t.cents), orders: t.orders };
  });
}

/** Best sellers in [from, to): by quantity, then revenue, then English name. */
export function topItems(sales: Sale[], from: number, to: number, n = 5): { itemId: string; name: Text; qty: number; revenue: number }[] {
  const items = new Map<string, { itemId: string; name: Text; qty: number; cents: number }>();
  for (const s of inRange(sales, from, to))
    for (const l of s.lines) {
      const it = items.get(l.itemId) ?? { itemId: l.itemId, name: l.name, qty: 0, cents: 0 };
      it.qty += l.qty;
      it.cents += Math.round(l.unitPrice * 100) * l.qty;
      items.set(l.itemId, it);
    }
  return [...items.values()]
    .sort((a, b) => b.qty - a.qty || b.cents - a.cents || a.name.en.localeCompare(b.name.en))
    .slice(0, n)
    .map(({ itemId, name, qty, cents }) => ({ itemId, name, qty, revenue: dollars(cents) }));
}

/** Shares of revenue in [from, to) by payment method; both 0 when there is none. */
export function paymentSplit(sales: Sale[], from: number, to: number): { khqr: number; cash: number } {
  const t = sum(inRange(sales, from, to));
  if (t.cents === 0) return { khqr: 0, cash: 0 };
  const khqr = t.khqrCents / t.cents;
  return { khqr, cash: 1 - khqr };
}

/** The trading day whose 9 pm report is the latest at `now`: today's from 21:00 (through the night), yesterday's before. */
export function reportDayStart(now: number): number {
  const start = tradingDayStart(now);
  return now >= start + (CLOSE_HOUR - OPEN_HOUR) * HOUR_MS ? start : start - DAY_MS;
}

/** The 9 pm report for the trading day containing `dayStart`, compared with the previous full trading day. */
export function dailyReport(sales: Sale[], dayStart: number) {
  const start = tradingDayStart(dayStart);
  const day = sum(inRange(sales, start, start + DAY_MS));
  const prev = sum(inRange(sales, start - DAY_MS, start));
  const top = topItems(sales, start, start + DAY_MS, 1)[0];
  return {
    key: dayKey(start),
    revenue: dollars(day.cents),
    orders: day.orders,
    avg: dollars(avgCents(day)),
    change: change(day.cents, prev.cents),
    best: top ? { name: top.name, qty: top.qty } : null,
    khqrShare: share(day.khqrCents, day.cents),
  };
}
