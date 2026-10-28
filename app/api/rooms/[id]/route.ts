import { err, publicRoom, store } from "@/features/table-order/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/rooms/[id]">) {
  const room = store.get((await ctx.params).id);
  if (!room) return err(404, "not_found");
  return Response.json(publicRoom(room), { headers: { "Cache-Control": "no-store" } });
}
