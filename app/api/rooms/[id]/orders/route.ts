import { err, store, toResponse } from "@/features/table-order/server";
import type { CartLine } from "@/features/table-order/types";

export const dynamic = "force-dynamic";

/**
 * Places a paid order, priced from the room's menu. 409 sold_out (+ itemId), closed, or price_changed (+ the new total,
 * when `expectedTotal` no longer matches); 400 bad_table above the room's table count.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/orders">) {
  const { id } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  let body: { table?: unknown; lines?: unknown; expectedTotal?: unknown };
  try {
    body = await req.json();
  } catch {
    return err(400, "bad_json");
  }
  const table = body?.table;
  if (typeof table !== "number" || !Number.isInteger(table) || table < 1 || table > 50) return err(400, "bad_table");
  if (!Array.isArray(body.lines)) return err(400, "bad_order");
  const expected = body.expectedTotal;
  if (expected !== undefined && (typeof expected !== "number" || !Number.isFinite(expected))) return err(400, "bad_order");
  try {
    const order = store.addOrder(id, table, body.lines as CartLine[], expected);
    return Response.json(order, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
