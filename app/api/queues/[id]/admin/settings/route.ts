import { err, guardAdmin, ok, readJson, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/** `{ name, autoCall }` (both; autoCall 0, 20 or 60 seconds) → 200 with the stored settings. */
export async function PUT(req: Request, ctx: RouteContext<"/api/queues/[id]/admin/settings">) {
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
