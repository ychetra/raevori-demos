import { err, isCounter, readJson, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/**
 * Staff "Call next" for one counter: answers `{ done, called }`. The board's auto-call sends `auto: true`, which
 * also tops the line up with walk-ins; a staff click doesn't, so staff can still empty the line. A closed counter is 409 counter_closed.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/queues/[id]/call">) {
  const { id } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  if (!isCounter(body.counter)) return err(400, "bad_counter");
  try {
    return Response.json(store.call(id, body.counter, { topUp: body.auto === true }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
