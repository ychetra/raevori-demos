import { err, guardAdmin, ok, readJson, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/**
 * `{ counters: [{ name?, open }, ...] }` (1-4, numbered by position) replaces the counters → 200 with them.
 * A counter that closes or goes while serving someone finishes that ticket as done.
 */
export async function PUT(req: Request, ctx: RouteContext<"/api/queues/[id]/admin/counters">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  try {
    return ok(store.setCounters(id, body.counters));
  } catch (e) {
    return toResponse(e);
  }
}
