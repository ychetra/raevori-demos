import { err, guardAdmin, ok, readJson, store, toResponse } from "@/features/queue/server";

export const dynamic = "force-dynamic";

async function serviceOf(req: Request): Promise<{ service: unknown } | { error: Response }> {
  const body = await readJson(req);
  if (!body) return { error: err(400, "bad_json") };
  return body.service && typeof body.service === "object" ? { service: body.service } : { error: err(400, "invalid", { field: "service" }) };
}

/** `{ service: { id, ...changes } }` edits a service (fields left out are kept) → 200 with the service; 409 prefix_taken. */
export async function PUT(req: Request, ctx: RouteContext<"/api/queues/[id]/admin/services">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await serviceOf(req);
  if ("error" in body) return body.error;
  try {
    return ok(store.updateService(id, body.service));
  } catch (e) {
    return toResponse(e);
  }
}

/** `{ service: { name, prefix, minutes?, hidden? } }` adds a service; the server picks its id → 201 with the service; 409 prefix_taken or too_many_services (6). */
export async function POST(req: Request, ctx: RouteContext<"/api/queues/[id]/admin/services">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await serviceOf(req);
  if ("error" in body) return body.error;
  try {
    return ok(store.addService(id, body.service), 201);
  } catch (e) {
    return toResponse(e);
  }
}
