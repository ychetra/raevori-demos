import { UNKNOWN_IP } from "@/lib/client-ip";
import { PricingError } from "./pricing";
import { createMemoryStore, RoomError, type RoomStore } from "./store";

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

export const err = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Maps domain errors to HTTP answers; anything else is rethrown. */
export function toResponse(e: unknown): Response {
  if (e instanceof RoomError) return e.code === "full" ? err(429, "full") : err(404, "not_found");
  if (e instanceof PricingError) return err(400, "bad_order");
  throw e;
}
