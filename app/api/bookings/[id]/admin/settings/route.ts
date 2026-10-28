import { err, guardAdmin, ok, readJson, store, toResponse } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** `{ name, open, close, deposit }` (all four) → 200 with the stored settings. */
export async function PUT(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/settings">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  try {
    return ok(store.setSettings(id, body));
  } catch (e) {
    return toResponse(e);
  }
}
