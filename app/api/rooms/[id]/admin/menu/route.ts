import { err, guardAdmin, ok, readJson, store, toResponse } from "@/features/table-order/server";

export const dynamic = "force-dynamic";

async function itemOf(req: Request): Promise<{ item: unknown } | { error: Response }> {
  const json = await readJson(req);
  if ("error" in json) return json;
  const item = json.body && typeof json.body === "object" ? (json.body as { item?: unknown }).item : undefined;
  return item && typeof item === "object" ? { item } : { error: err(400, "invalid", { field: "item" }) };
}

/** `{ item: { id, ...changes } }` edits an existing item (fields left out are kept) → 200 with the item. */
export async function PUT(req: Request, ctx: RouteContext<"/api/rooms/[id]/admin/menu">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await itemOf(req);
  if ("error" in body) return body.error;
  try {
    return ok(store.updateItem(id, body.item));
  } catch (e) {
    return toResponse(e);
  }
}

/** `{ item: { name, price, cat, note?, image?, options?, soldOut?, hidden? } }` adds an item; the server picks its id → 201 with the item. */
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[id]/admin/menu">) {
  const { id } = await ctx.params;
  const denied = guardAdmin(req, id);
  if (denied) return denied;
  const body = await itemOf(req);
  if ("error" in body) return body.error;
  try {
    return ok(store.addItem(id, body.item), 201);
  } catch (e) {
    return toResponse(e);
  }
}
