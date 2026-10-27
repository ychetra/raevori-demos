import { err, isCounter, readJson, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/** Calls a counter's current ticket again: answers `{ ticket }`, null when the counter is idle. */
export async function POST(req: Request, ctx: RouteContext<"/api/queues/[id]/recall">) {
  const { id } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  if (!isCounter(body.counter)) return err(400, "bad_counter");
  try {
    return Response.json({ ticket: store.recall(id, body.counter) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
