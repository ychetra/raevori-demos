import { bookingsCsv } from "@/features/booking/admin";
import { guardAdmin, store } from "@/features/booking/server";
import { dayKey } from "@/features/shop-pulse/time";

export const dynamic = "force-dynamic";

/** Every booking in the room (phones included: only the logged-in owner gets it) as CSV for Excel. `?lang=km` writes stylist and service names in Khmer. */
export async function GET(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/export.csv">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const room = store.get(id)!;
  const lang = new URL(req.url).searchParams.get("lang") === "km" ? "km" : "en";
  return new Response(bookingsCsv(room.bookings, room, lang), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings-${dayKey(Date.now())}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
