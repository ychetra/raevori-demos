import { createRoomLimiter, err, type RoomLimiter } from "@/features/table-order/server";
import { createMemoryStore, QueueError, type QueueStore } from "./store";
import { COUNTERS, SERVICES, type Counter, type Service } from "./types";

export { err };

const g = globalThis as typeof globalThis & { __queueStore?: QueueStore; __queueSweep?: ReturnType<typeof setInterval>; __queueLimiter?: RoomLimiter };

/** One store per server process (survives dev hot reloads). Expired queues are swept every 5 minutes. */
export const store: QueueStore = (g.__queueStore ??= createMemoryStore());
g.__queueSweep ??= setInterval(() => store.sweep(), 5 * 60 * 1000);
g.__queueSweep.unref?.();

/** One queue-creation limiter per server process (20 per IP per rolling hour), separate from Table Order's. */
export const queueLimiter: RoomLimiter = (g.__queueLimiter ??= createRoomLimiter());

export const isService = (v: unknown): v is Service => typeof v === "string" && (SERVICES as string[]).includes(v);
export const isCounter = (v: unknown): v is Counter => typeof v === "number" && (COUNTERS as number[]).includes(v);

/** The JSON body, or null when it is not valid JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

/** Maps domain errors to HTTP answers; anything else is rethrown. */
export function toResponse(e: unknown): Response {
  if (e instanceof QueueError) return e.code === "full" ? err(429, "full") : err(404, "not_found");
  throw e;
}
