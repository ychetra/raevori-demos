import { publicBooking, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** Simulated deposit payment: turns the hold into a booking, or answers 410 `expired` once the hold has run out. */
export async function POST(_req: Request, ctx: RouteContext<"/api/bookings/[id]/holds/[hid]/pay">) {
  const { id, hid } = await ctx.params;
  try {
    return Response.json(publicBooking(store.pay(id, hid)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
