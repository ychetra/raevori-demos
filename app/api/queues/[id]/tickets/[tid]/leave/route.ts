import { store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: RouteContext<"/api/queues/[id]/tickets/[tid]/leave">) {
  const { id, tid } = await ctx.params;
  try {
    return Response.json(store.leave(id, tid), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
