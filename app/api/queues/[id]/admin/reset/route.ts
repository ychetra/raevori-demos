import { guardAdmin, ok, publicQueue, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/** Restores the default services, counters and settings; tickets and the PIN stay. → 200 with the queue's public snapshot. */
export async function POST(req: Request, ctx: RouteContext<"/api/queues/[id]/admin/reset">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  try {
    return ok(publicQueue(store.reset(id)));
  } catch (e) {
    return toResponse(e);
  }
}
