import { guardAdmin, ok, readJson, store, toResponse } from "@/features/table-order/server";

export const dynamic = "force-dynamic";

/** `{ status: "done" }` or `{ status: "cancelled", reason }` (1-120 characters) → 200 with the order; 409 bad_status once it is done or cancelled. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/rooms/[id]/admin/orders/[orderId]">) {
  const { id, orderId } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const json = await readJson(req);
  if ("error" in json) return json.error;
  const { status, reason } = (json.body && typeof json.body === "object" ? json.body : {}) as { status?: unknown; reason?: unknown };
  try {
    return ok(store.setOrderStatus(id, orderId, status as "done" | "cancelled", reason));
  } catch (e) {
    return toResponse(e);
  }
}
