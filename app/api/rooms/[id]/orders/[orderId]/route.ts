import { store, toResponse } from "@/features/table-order/server";

export const dynamic = "force-dynamic";

export async function PATCH(_req: Request, ctx: RouteContext<"/api/rooms/[id]/orders/[orderId]">) {
  const { id, orderId } = await ctx.params;
  try {
    return Response.json(store.advance(id, orderId), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
