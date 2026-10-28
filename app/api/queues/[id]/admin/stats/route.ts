import { queueStats } from "@/features/queue/admin";
import { guardAdmin, ok, store } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/** Today's numbers, Phnom Penh day: `{ day, served, left, avgWait, longestWait }` (waits in minutes, null before anyone was called). */
export async function GET(req: Request, ctx: RouteContext<"/api/queues/[id]/admin/stats">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  return ok(queueStats(store.get(id)!.tickets, Date.now()));
}
