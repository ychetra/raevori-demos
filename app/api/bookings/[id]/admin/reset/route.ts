import { guardAdmin, ok, publicRoom, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** Restores the default services, stylists and settings; bookings and the PIN stay. → 200 with the room's public snapshot. */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/reset">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  try {
    return ok(publicRoom(store.reset(id)));
  } catch (e) {
    return toResponse(e);
  }
}
