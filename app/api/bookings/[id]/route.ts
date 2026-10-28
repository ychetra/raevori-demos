import { err, publicRoom, store } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** The room's public snapshot: `{ bookings, services, stylists, settings }`, without phones or the PIN. */
export async function GET(_req: Request, ctx: RouteContext<"/api/bookings/[id]">) {
  const room = store.get((await ctx.params).id);
  if (!room) return err(404, "not_found");
  return Response.json(publicRoom(room), { headers: { "Cache-Control": "no-store" } });
}
