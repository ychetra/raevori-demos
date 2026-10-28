import { ordersCsv } from "@/features/table-order/admin";
import { guardAdmin, store } from "@/features/table-order/server";
import { dayKey } from "@/features/shop-pulse/time";

export const dynamic = "force-dynamic";

/** Every order in the room as CSV for Excel. `?lang=km` writes the item names in Khmer. */
export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[id]/admin/export.csv">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const lang = new URL(req.url).searchParams.get("lang") === "km" ? "km" : "en";
  return new Response(ordersCsv(store.get(id)!.orders, lang), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="orders-${dayKey(Date.now())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
