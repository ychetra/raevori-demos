import { err, guardAdmin, ok, readJson, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

async function stylistOf(req: Request): Promise<{ stylist: unknown } | { error: Response }> {
  const body = await readJson(req);
  if (!body) return { error: err(400, "bad_json") };
  return body.stylist && typeof body.stylist === "object" ? { stylist: body.stylist } : { error: err(400, "invalid", { field: "stylist" }) };
}

/** `{ stylist: { id, name?, daysOff?, hours? } }` edits a stylist (fields left out are kept) → 200 with the stylist; 404 for an unknown id. */
export async function PUT(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/stylists">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await stylistOf(req);
  if ("error" in body) return body.error;
  try {
    return ok(store.updateStylist(id, body.stylist));
  } catch (e) {
    return toResponse(e);
  }
}

/** `{ stylist: { name, daysOff?, hours? } }` adds a stylist at the end of the roster; the server picks its id → 201; 409 too_many_stylists past 5. */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/stylists">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await stylistOf(req);
  if ("error" in body) return body.error;
  try {
    return ok(store.addStylist(id, body.stylist), 201);
  } catch (e) {
    return toResponse(e);
  }
}
