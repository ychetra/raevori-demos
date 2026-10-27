import { err, store } from "@/features/booking/server";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  const room = store.get((await ctx.params).id);
  if (!room) return err(404, "not_found");
  return Response.json({ bookings: room.bookings }, { headers: { "Cache-Control": "no-store" } });
}
