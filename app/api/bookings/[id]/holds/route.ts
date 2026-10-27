import { err, isService, isStylistChoice, readJson, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** Holds a slot for 5 minutes while the phone pays the deposit: 201 with the held booking, 409 `taken` when it is gone. */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/holds">) {
  const { id } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  const { service, stylist, start, name, phone } = body;
  if (!isService(service)) return err(400, "bad_service");
  if (!isStylistChoice(stylist)) return err(400, "bad_stylist");
  if (typeof start !== "number") return err(400, "bad_start");
  if (typeof name !== "string") return err(400, "bad_name");
  if (phone !== undefined && typeof phone !== "string") return err(400, "bad_phone");
  try {
    return Response.json(store.hold(id, { service, stylist, start, name, phone }), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
