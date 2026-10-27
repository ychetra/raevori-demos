import { createRoomLimiter, err, type RoomLimiter } from "@/features/table-order/server";
import { SERVICE_IDS, STYLISTS } from "./salon";
import { BookingError, createMemoryStore, type BookingStore } from "./store";
import type { ServiceId, StylistId, VisitStatus } from "./types";

export { err };

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

export const isService = (v: unknown): v is ServiceId => typeof v === "string" && (SERVICE_IDS as string[]).includes(v);
export const isStylistChoice = (v: unknown): v is StylistId | "any" => v === "any" || (typeof v === "string" && (STYLISTS as string[]).includes(v));
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
};

/** Maps domain errors to HTTP answers; anything else is rethrown. */
export function toResponse(e: unknown): Response {
  if (e instanceof BookingError) return err(STATUS[e.code], e.code);
  throw e;
}
