import { ticketsCsv } from "@/features/queue/admin";
import { guardAdmin, store } from "@/features/queue/server";
import { dayKey } from "@/features/shop-pulse/time";

export const dynamic = "force-dynamic";

/** Every ticket in the queue as CSV for Excel. `?lang=km` writes the service names in Khmer. */
export async function GET(req: Request, ctx: RouteContext<"/api/queues/[id]/admin/export.csv">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const lang = new URL(req.url).searchParams.get("lang") === "km" ? "km" : "en";
  const queue = store.get(id)!;
  return new Response(ticketsCsv(queue.tickets, queue.services, lang), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${dayKey(Date.now())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
