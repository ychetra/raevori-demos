import { err, isService, readJson, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

/** `{ service }` → 201 with the new waiting ticket; 400 bad_service for a service the queue doesn't have, 409 hidden for one it hides. */
export async function POST(req: Request, ctx: RouteContext<"/api/queues/[id]/tickets">) {
  const { id } = await ctx.params;
  if (!store.get(id)) return err(404, "not_found");
  const body = await readJson(req);
  if (!body) return err(400, "bad_json");
  if (!isService(body.service)) return err(400, "bad_service");
  try {
    return Response.json(store.take(id, body.service), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return toResponse(e);
  }
}
