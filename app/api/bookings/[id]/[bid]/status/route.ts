import { err, isVisitStatus, publicBooking, readJson, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** Staff mark a booked slot `{ status: "arrived" | "noshow" }`; 409 `wrong_state` when it is not booked. */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/[bid]/status">) {
  const { id, bid } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  if (!isVisitStatus(body.status)) return err(400, "bad_status");
  try {
    return Response.json(publicBooking(store.setStatus(id, bid, body.status)), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
