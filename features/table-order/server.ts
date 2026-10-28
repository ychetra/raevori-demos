import { UNKNOWN_IP } from "@/lib/client-ip";
import { AdminError } from "./admin";
import { isAdmin } from "./admin-auth";
import { PricingError } from "./pricing";
import { createMemoryStore, RoomError, type RoomStore } from "./store";
import type { Room } from "./types";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Rooms each IP may create per rolling hour, so a loop of requests cannot evict everyone's live rooms.
 * Kept in memory; IPs with no room in the last hour are dropped on each call, which bounds the map.
 */
export function createRoomLimiter({ perHour = 20, now = Date.now }: { perHour?: number; now?: () => number } = {}) {
  const created = new Map<string, number[]>();
  return {
    /** Records a room for `ip` and returns true, or returns false (recording nothing) when the IP is over the limit. */
    allow(ip: string): boolean {
      if (ip === UNKNOWN_IP) return true; // no proxy header: local run or test, never production
      const cutoff = now() - HOUR_MS;
      for (const [key, times] of created) {
        const recent = times.filter((t) => t > cutoff);
        if (recent.length) created.set(key, recent);
        else created.delete(key);
      }
      const times = created.get(ip) ?? [];
      if (times.length >= perHour) return false;
      created.set(ip, [...times, now()]);
      return true;
    },
    /** How many IPs are being tracked (for tests). */
    size: () => created.size,
  };
}

export type RoomLimiter = ReturnType<typeof createRoomLimiter>;

const g = globalThis as typeof globalThis & { __roomStore?: RoomStore; __roomSweep?: ReturnType<typeof setInterval>; __roomLimiter?: RoomLimiter };

/** One store per server process (survives dev hot reloads). Expired rooms are swept every 5 minutes. */
export const store: RoomStore = (g.__roomStore ??= createMemoryStore());
g.__roomSweep ??= setInterval(() => store.sweep(), 5 * 60 * 1000);
g.__roomSweep.unref?.();

/**
 * One room-creation limiter per server process. Table Order and Shop Pulse share it, and offices and mobile
 * carriers put many visitors behind one IP, so it allows 40 an hour (Booking and Queue keep the default 20).
 */
export const ROOMS_PER_HOUR = 40;
export const roomLimiter: RoomLimiter = (g.__roomLimiter ??= createRoomLimiter({ perHour: ROOMS_PER_HOUR }));

export const err = (status: number, error: string, extra: Record<string, unknown> = {}) =>
  Response.json({ error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

export const ok = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const STATUS: Record<RoomError["code"], number> = {
  not_found: 404,
  full: 429,
  sold_out: 409,
  closed: 409,
  bad_table: 400,
  bad_status: 409,
  price_changed: 409,
  too_many_items: 409,
};

/** Maps domain errors to HTTP answers; anything else is rethrown. sold_out carries `itemId`, price_changed the new `total`. */
export function toResponse(e: unknown): Response {
  if (e instanceof RoomError) {
    const extra = { ...(e.itemId !== undefined && { itemId: e.itemId }), ...(e.total !== undefined && { total: e.total }) };
    return err(STATUS[e.code], e.code, extra);
  }
  if (e instanceof PricingError) return err(400, "bad_order");
  if (e instanceof AdminError) return err(400, "invalid", { field: e.field });
  throw e;
}

/** The parts of a room anyone with its id may see: never the PIN. */
export const publicRoom = (r: Room) => ({ orders: r.orders, menu: r.menu, settings: r.settings });

/** The JSON body, or a 400 bad_json answer. */
export async function readJson(req: Request): Promise<{ body: unknown } | { error: Response }> {
  try {
    return { body: await req.json() };
  } catch {
    return { error: err(400, "bad_json") };
  }
}

/** For every admin route: 404 for an unknown room, 401 without this room's signed admin cookie, else null (go ahead). */
export function guardAdmin(req: Request, id: string): Response | null {
  if (!store.get(id)) return err(404, "not_found");
  if (!isAdmin(req, id)) return err(401, "login");
  return null;
}
