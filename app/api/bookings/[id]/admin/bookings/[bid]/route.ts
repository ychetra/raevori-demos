import { err, guardAdmin, ok, publicBooking, readJson, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/**
 * `{ action: "cancel", reason, refund }` (reason 1-120 characters, refund true/false) or `{ action: "move", start, stylist? }`
 * → 200 with the booking (no phone; it keeps its id, so the customer's confirmation follows it).
 * 409 wrong_state unless it is held or booked; 409 taken when the new start is not free; 400 bad_start / bad_stylist.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/bookings/[bid]">) {
  const { id, bid } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  try {
    if (body.action === "cancel") return ok(publicBooking(store.cancel(id, bid, body.reason, body.refund)));
    if (body.action === "move") return ok(publicBooking(store.move(id, bid, body.start, body.stylist)));
    return err(400, "invalid", { field: "action" });
  } catch (e) {
    return toResponse(e);
  }
}
