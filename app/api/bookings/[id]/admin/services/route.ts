import { err, guardAdmin, ok, readJson, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** `{ service: { id, price?, minutes?, hidden? } }` edits a service (fields left out are kept) → 200 with the service; 404 for an unknown id. */
export async function PUT(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/services">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  if (!body.service || typeof body.service !== "object") return err(400, "invalid", { field: "service" });
  try {
    return ok(store.updateService(id, body.service));
  } catch (e) {
    return toResponse(e);
  }
}
