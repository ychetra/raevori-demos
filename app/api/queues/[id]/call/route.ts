import { err, isCounter, readJson, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/** Staff "Call next" for one counter: answers `{ done, called }`. */
export async function POST(req: Request, ctx: RouteContext<"/api/queues/[id]/call">) {
  const { id } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  if (!isCounter(body.counter)) return err(400, "bad_counter");
  try {
    return Response.json(store.call(id, body.counter), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
