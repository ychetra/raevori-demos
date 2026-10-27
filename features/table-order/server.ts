import { PricingError } from "./pricing";
import { createMemoryStore, RoomError, type RoomStore } from "./store";

const g = globalThis as typeof globalThis & { __roomStore?: RoomStore; __roomSweep?: ReturnType<typeof setInterval> };

/** One store per server process (survives dev hot reloads). Expired rooms are swept every 5 minutes. */
export const store: RoomStore = (g.__roomStore ??= createMemoryStore());
g.__roomSweep ??= setInterval(() => store.sweep(), 5 * 60 * 1000);
g.__roomSweep.unref?.();

export const err = (status: number, error: string) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Maps domain errors to HTTP answers; anything else is rethrown. */
export function toResponse(e: unknown): Response {
  if (e instanceof RoomError) return e.code === "full" ? err(429, "full") : err(404, "not_found");
  if (e instanceof PricingError) return err(400, "bad_order");
  throw e;
}
