import { startOfDay } from "@/features/shop-pulse/time";
import { availability } from "../availability";
import type { Booking, BookingStatus, ServiceId, StylistId } from "../types";

/**
 * Index into `days` of the first day with any free time for `service` and `stylist`, so the phone's day strip
 * doesn't open on a full (or already closed) today. Today (0) when no day has a free time.
 */
export function firstDayWithTimes(bookings: Booking[], service: ServiceId, stylist: StylistId | "any", days: number[], now: number): number {
  const i = days.findIndex((d) => availability(bookings, service, stylist, d, now).length > 0);
  return i < 0 ? 0 : i;
}

/**
 * The day the laptop calendar should switch to after a live change, or null to stay put.
 * `seen` is each booking's status before the change (null before the first snapshot, which never moves the calendar).
 * A new hold or a payment on a day that isn't `shown` moves it to that day; the latest such booking wins.
 * Expiry and staff marks (arrived, no-show) never move it.
 */
export function dayToFollow(seen: ReadonlyMap<string, BookingStatus> | null, bookings: Booking[], days: number[], shown: number | null): number | null {
  if (seen === null) return null;
  const fresh = bookings.filter((b) => {
    const before = seen.get(b.id);
    return before === undefined ? b.status === "held" || b.status === "booked" : b.status === "booked" && before !== "booked";
  });
  const latest = fresh.at(-1);
  if (!latest) return null;
  const day = startOfDay(latest.start);
  const i = days.indexOf(day);
  return i < 0 || day === shown ? null : i;
}
