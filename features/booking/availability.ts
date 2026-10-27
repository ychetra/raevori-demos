import { HOUR_MS, startOfDay } from "@/features/shop-pulse/time";
import { CLOSE_HOUR, durationMs, OPEN_HOUR, SLOT_MS, STYLISTS } from "./salon";
import type { Booking, ServiceId, StylistId } from "./types";

/** A hold counts until `holdUntil` (exclusive); booked, arrived and no-show slots always count; expired never does. */
export const blocks = (b: Booking, now: number): boolean =>
  b.status === "held" ? b.holdUntil !== undefined && now < b.holdUntil : b.status !== "expired";

/** Every 30-minute start from 09:00 to 18:30, Phnom Penh, on the day containing `day`. */
export function slotStarts(day: number): number[] {
  const open = startOfDay(day) + OPEN_HOUR * HOUR_MS;
  return Array.from({ length: ((CLOSE_HOUR - OPEN_HOUR) * HOUR_MS) / SLOT_MS }, (_, i) => open + i * SLOT_MS);
}

/**
 * True when `stylist` can do `service` from `start`: on the slot grid, after `now`, finished by 19:00,
 * and not overlapping anything that blocks (touching edges are fine).
 */
export function isFree(bookings: Booking[], service: ServiceId, stylist: StylistId, start: number, now: number): boolean {
  const day = startOfDay(start);
  const open = day + OPEN_HOUR * HOUR_MS;
  const end = start + durationMs(service);
  if (start <= now || start < open || end > day + CLOSE_HOUR * HOUR_MS || (start - open) % SLOT_MS !== 0) return false;
  return !bookings.some((b) => b.stylist === stylist && b.start < end && start < b.end && blocks(b, now));
}

/** Who "Anyone" gets: the first free stylist in roster order, or null when everyone is busy. */
export function freeStylist(bookings: Booking[], service: ServiceId, start: number, now: number): StylistId | null {
  return STYLISTS.find((s) => isFree(bookings, service, s, start, now)) ?? null;
}

/**
 * Free start times (epoch ms, ascending) for `service` on the Phnom Penh day containing `day`.
 * With "any", a start is free when at least one stylist is. Pure: the server re-checks with the same rules on hold.
 */
export function availability(bookings: Booking[], service: ServiceId, stylist: StylistId | "any", day: number, now: number): number[] {
  return slotStarts(day).filter((start) =>
    stylist === "any" ? freeStylist(bookings, service, start, now) !== null : isFree(bookings, service, stylist, start, now),
  );
}
