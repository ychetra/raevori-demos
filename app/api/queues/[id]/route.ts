import { err, publicQueue, store } from "@/features/queue/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/queues/[id]">) {
  const queue = store.get((await ctx.params).id);
  if (!queue) return err(404, "not_found");
  return Response.json(publicQueue(queue), { headers: { "Cache-Control": "no-store" } });
}
