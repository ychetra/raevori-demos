import { startOfDay, weekday } from "@/features/shop-pulse/time";
import { DEFAULT_SALON, DEFAULT_SETTINGS, SLOT_MS, toMinutes } from "./salon";
import type { Booking, SalonConfig, SalonSettings, ServiceId, Stylist, StylistId, Weekday } from "./types";

const MINUTE_MS = 60_000;

/** A hold counts until `holdUntil` (exclusive); booked, arrived and no-show slots always count; expired and cancelled never do. */
export const blocks = (b: Booking, now: number): boolean =>
  b.status === "held" ? b.holdUntil !== undefined && now < b.holdUntil : b.status !== "expired" && b.status !== "cancelled";

/** Every 30-minute start from opening to half an hour before closing (09:00 to 18:30 by default), Phnom Penh, on the day containing `day`. */
export function slotStarts(day: number, settings: SalonSettings = DEFAULT_SETTINGS): number[] {
  const d = startOfDay(day);
  const open = toMinutes(settings.open);
  return Array.from({ length: Math.max(0, (toMinutes(settings.close) - open) / 30) }, (_, i) => d + (open + i * 30) * MINUTE_MS);
}

/** When `stylist` works on the day containing `day` (epoch ms): their hours cut to the salon's, or null on a day off. */
export function workingHours(stylist: Stylist, day: number, settings: SalonSettings): { from: number; to: number } | null {
  if (stylist.daysOff.includes(weekday(day) as Weekday)) return null;
  const d = startOfDay(day);
  const from = d + Math.max(toMinutes(settings.open), toMinutes(stylist.hours.start)) * MINUTE_MS;
  const to = d + Math.min(toMinutes(settings.close), toMinutes(stylist.hours.end)) * MINUTE_MS;
  return from < to ? { from, to } : null;
}

/**
 * True when `stylist` can take `ms` of work from `start`: on the half-hour grid, after `now`, inside their working hours
 * that day, and not overlapping anything that blocks (touching edges are fine). `ignore` is a booking id left out of the
 * overlap check (a booking being moved never clashes with itself).
 */
export function fits(bookings: Booking[], stylist: Stylist, start: number, ms: number, now: number, settings: SalonSettings, ignore?: string): boolean {
  const hours = workingHours(stylist, start, settings);
  if (!hours || start <= now || start < hours.from || start + ms > hours.to || (start - startOfDay(start)) % SLOT_MS !== 0) return false;
  const end = start + ms;
  return !bookings.some((b) => b.id !== ignore && b.stylist === stylist.id && b.start < end && start < b.end && blocks(b, now));
}

/** The service's length in the salon's menu, or null when it is hidden or unknown (it can't be booked). */
const bookableMs = (salon: SalonConfig, service: ServiceId) => {
  const s = salon.services.find((x) => x.id === service);
  return s && !s.hidden ? s.minutes * MINUTE_MS : null;
};

/**
 * True when `stylist` can do `service` from `start` in `salon` (the default salon when not given): the service is on the
 * menu and not hidden, and the stylist works then and is free for its whole length.
 */
export function isFree(bookings: Booking[], service: ServiceId, stylist: StylistId, start: number, now: number, salon: SalonConfig = DEFAULT_SALON): boolean {
  const ms = bookableMs(salon, service);
  const st = salon.stylists.find((s) => s.id === stylist);
  return ms !== null && st !== undefined && fits(bookings, st, start, ms, now, salon.settings);
}

/** Who "Anyone" gets: the first free stylist in roster order among those working then, or null when everyone is busy or off. */
export function freeStylist(bookings: Booking[], service: ServiceId, start: number, now: number, salon: SalonConfig = DEFAULT_SALON): StylistId | null {
  return salon.stylists.find((s) => isFree(bookings, service, s.id, start, now, salon))?.id ?? null;
}

/**
 * Free start times (epoch ms, ascending) for `service` on the Phnom Penh day containing `day`, in the room's `salon`.
 * With "any", a start is free when at least one stylist is. Pure: the server re-checks with the same rules on hold.
 */
export function availability(bookings: Booking[], service: ServiceId, stylist: StylistId | "any", day: number, now: number, salon: SalonConfig = DEFAULT_SALON): number[] {
  return slotStarts(day, salon.settings).filter((start) =>
    stylist === "any" ? freeStylist(bookings, service, start, now, salon) !== null : isFree(bookings, service, stylist, start, now, salon),
  );
}
