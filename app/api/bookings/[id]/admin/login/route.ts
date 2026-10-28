import { adminCookie } from "@/features/booking/admin-auth";
import { err, guardAdmin, readJson, store } from "@/features/booking/server";

export const dynamic = "force-dynamic";

/** `{ pin }` → 204 with the room's admin cookie; 401 wrong_pin; 429 too_many_tries after 5 wrong PINs in 10 minutes. */
export async function POST(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/login">) {
  const { id } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  const result = store.login(id, body.pin);
  if (result === "locked") return err(429, "too_many_tries");
  if (result === "wrong") return err(401, "wrong_pin");
  return new Response(null, { status: 204, headers: { "Set-Cookie": adminCookie(req, id), "Cache-Control": "no-store" } });
}

/** Whether this browser is logged in to the room's admin: 204 yes, 401 no, 404 unknown room. */
export async function GET(req: Request, ctx: RouteContext<"/api/bookings/[id]/admin/login">) {
  const { id } = await ctx.params;
  return guardAdmin(req, id) ?? new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
