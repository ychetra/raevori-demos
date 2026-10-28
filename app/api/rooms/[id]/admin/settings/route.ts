import { guardAdmin, ok, readJson, store, toResponse } from "@/features/table-order/server";

export const dynamic = "force-dynamic";

/** `{ name, tables, open, close }` (all four) → 200 with the stored settings. */
export async function PUT(req: Request, ctx: RouteContext<"/api/rooms/[id]/admin/settings">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const json = await readJson(req);
  if ("error" in json) return json.error;
  try {
    return ok(store.setSettings(id, json.body));
  } catch (e) {
    return toResponse(e);
  }
}
