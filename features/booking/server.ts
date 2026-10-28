import { createRoomLimiter, err, type RoomLimiter } from "@/features/table-order/server";
import { AdminError } from "./admin";
import { isAdmin } from "./admin-auth";
import { SERVICE_IDS } from "./salon";
import { BookingError, createMemoryStore, salonOf, type BookingStore } from "./store";
import type { Booking, BookingEvent, BookingRoom, ServiceId, StylistId, VisitStatus } from "./types";

export { err };

export const ok = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const g = globalThis as typeof globalThis & { __bookingStore?: BookingStore; __bookingSweep?: ReturnType<typeof setInterval>; __bookingLimiter?: RoomLimiter };

/**
 * One store per server process (survives dev hot reloads). Swept every minute: run-out holds become expired
 * and idle rooms are dropped. Open calendars also sweep their own room every few seconds (see the events route).
 */
export const store: BookingStore = (g.__bookingStore ??= createMemoryStore());
g.__bookingSweep ??= setInterval(() => store.sweep(), 60 * 1000);
g.__bookingSweep.unref?.();

/** One booking-room creation limiter per server process (20 per IP per rolling hour), separate from the other demos'. */
export const bookingLimiter: RoomLimiter = (g.__bookingLimiter ??= createRoomLimiter());

/**
 * A booking as it leaves the server: without the visitor's phone, which stays in the room. Everyone with the room
 * link gets the snapshot and the live events, so only the hold response (to the phone that typed it) carries it.
 */
export const publicBooking = ({ phone: _phone, ...b }: Booking): Booking => b;

/** The parts of a room anyone with its id may see: the bookings without phones, and the salon config. Never the PIN. */
export const publicRoom = (r: BookingRoom) => ({ bookings: r.bookings.map(publicBooking), ...salonOf(r) });

/** A live event as it leaves the server (see publicBooking). Config events carry only the config (see salonOf). */
export const publicEvent = <E extends BookingEvent | { type: "closed" }>(e: E): E =>
  e.type === "snapshot" ? { ...e, bookings: e.bookings.map(publicBooking) } : e.type === "booking" ? { ...e, booking: publicBooking(e.booking) } : e;

export const isService = (v: unknown): v is ServiceId => typeof v === "string" && (SERVICE_IDS as string[]).includes(v);
/** "any" or a stylist id; whether that stylist is on the room's roster is the store's check (`bad_stylist`). */
export const isStylistChoice = (v: unknown): v is StylistId | "any" => typeof v === "string" && v.length > 0;
export const isVisitStatus = (v: unknown): v is VisitStatus => v === "arrived" || v === "noshow";

/** The JSON body, or null when it is not valid JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

const STATUS: Record<BookingError["code"], number> = {
  not_found: 404,
  full: 429,
  taken: 409,
  wrong_state: 409,
  expired: 410,
  bad_name: 400,
  bad_phone: 400,
  bad_start: 400,
  bad_service: 400,
  bad_stylist: 400,
  too_many_stylists: 409,
};

/** Maps domain errors to HTTP answers; anything else is rethrown. An admin input error is 400 `{ error: "invalid", field }`. */
export function toResponse(e: unknown): Response {
  if (e instanceof BookingError) return err(STATUS[e.code], e.code);
  if (e instanceof AdminError) return err(400, "invalid", { field: e.field });
  throw e;
}

/** For every admin route: 404 for an unknown room, 401 without this room's signed admin cookie, else null (go ahead). */
export function guardAdmin(req: Request, id: string): Response | null {
  if (!store.get(id)) return err(404, "not_found");
  if (!isAdmin(req, id)) return err(401, "login");
  return null;
}
