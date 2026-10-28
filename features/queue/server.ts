import { createRoomLimiter, err, type RoomLimiter } from "@/features/table-order/server";
import { AdminError } from "./admin";
import { isAdmin } from "./admin-auth";
import { createMemoryStore, QueueError, type QueueStore } from "./store";
import { COUNTERS, type Counter, type Queue } from "./types";

export { err };

const g = globalThis as typeof globalThis & { __queueStore?: QueueStore; __queueSweep?: ReturnType<typeof setInterval>; __queueLimiter?: RoomLimiter };

/** One store per server process (survives dev hot reloads). Expired queues are swept every 5 minutes. */
export const store: QueueStore = (g.__queueStore ??= createMemoryStore());
g.__queueSweep ??= setInterval(() => store.sweep(), 5 * 60 * 1000);
g.__queueSweep.unref?.();

/** One queue-creation limiter per server process (20 per IP per rolling hour), separate from Table Order's. */
export const queueLimiter: RoomLimiter = (g.__queueLimiter ??= createRoomLimiter());

/** A service id's shape; whether the queue has that service (and shows it) is the store's call. */
export const isService = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 40;
/** Counter 1-4; whether the queue has it open is the store's call. */
export const isCounter = (v: unknown): v is Counter => typeof v === "number" && (COUNTERS as number[]).includes(v);

export const ok = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** The JSON body, or null when it is not valid JSON. */
export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

const STATUS: Record<QueueError["code"], number> = {
  not_found: 404,
  full: 429,
  bad_service: 400,
  hidden: 409,
  counter_closed: 409,
  prefix_taken: 409,
  too_many_services: 409,
};

/** Maps domain errors to HTTP answers; anything else is rethrown. */
export function toResponse(e: unknown): Response {
  if (e instanceof QueueError) return err(STATUS[e.code], e.code);
  if (e instanceof AdminError) return err(400, "invalid", { field: e.field });
  throw e;
}

/** The parts of a queue anyone with its id may see: never the PIN. */
export const publicQueue = (q: Queue) => ({ tickets: q.tickets, services: q.services, counters: q.counters, settings: q.settings });

/** For every admin route: 404 for an unknown queue, 401 without this queue's signed admin cookie, else null (go ahead). */
export function guardAdmin(req: Request, id: string): Response | null {
  if (!store.get(id)) return err(404, "not_found");
  if (!isAdmin(req, id)) return err(401, "login");
  return null;
}
