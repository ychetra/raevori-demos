import type { CartLine, Order } from "./types";

/**
 * sold_out: `itemId` is sold out or hidden now. closed: outside the shop's hours. price_changed: the menu changed since the
 * phone priced the cart; `total` is the server's total (only when `expectedTotal` was sent). bad_table: above the room's tables.
 */
export type PlaceResult =
  | { ok: true; order: Order }
  | { ok: false; error: "full" | "not_found" | "failed" | "closed" | "bad_table" }
  | { ok: false; error: "sold_out"; itemId: string }
  | { ok: false; error: "price_changed"; total: number };

/** Thrown by createRoom; `status` is 429 when this network has made too many demo rooms. */
export class CreateRoomError extends Error {
  constructor(readonly status: number) {
    super(`create room ${status}`);
  }
}

/** A new room; `pin` is its owner-admin PIN, told only to the page that created the room. */
export async function createRoom(): Promise<{ id: string; pin: string }> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new CreateRoomError(res.status);
  return (await res.json()) as { id: string; pin: string };
}

export async function roomExists(id: string): Promise<boolean> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`, { cache: "no-store" });
  return res.ok;
}

/** Places a paid order. Pass `expectedTotal` (the total the customer saw) to be told price_changed instead of being charged a different total. */
export async function placeOrder(room: string, table: number, lines: CartLine[], expectedTotal?: number): Promise<PlaceResult> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, lines, ...(expectedTotal !== undefined && { expectedTotal }) }),
    });
    if (res.status === 201) return { ok: true, order: (await res.json()) as Order };
    if (res.status === 429) return { ok: false, error: "full" };
    if (res.status === 404) return { ok: false, error: "not_found" };
    if (res.status === 409 || res.status === 400) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; itemId?: string; total?: number };
      if (body.error === "sold_out" && body.itemId) return { ok: false, error: "sold_out", itemId: body.itemId };
      if (body.error === "price_changed" && typeof body.total === "number") return { ok: false, error: "price_changed", total: body.total };
      if (body.error === "closed" || body.error === "bad_table") return { ok: false, error: body.error };
    }
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function advanceOrder(room: string, orderId: string): Promise<void> {
  await fetch(`/api/rooms/${encodeURIComponent(room)}/orders/${encodeURIComponent(orderId)}`, { method: "PATCH" });
}
