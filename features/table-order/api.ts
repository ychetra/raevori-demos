import type { CartLine, Order } from "./types";

export type PlaceResult = { ok: true; order: Order } | { ok: false; error: "full" | "not_found" | "failed" };

export async function createRoom(): Promise<string> {
  const res = await fetch("/api/rooms", { method: "POST" });
  if (!res.ok) throw new Error(`create room ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

export async function roomExists(id: string): Promise<boolean> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(id)}`, { cache: "no-store" });
  return res.ok;
}

export async function placeOrder(room: string, table: number, lines: CartLine[]): Promise<PlaceResult> {
  try {
    const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ table, lines }),
    });
    if (res.status === 201) return { ok: true, order: (await res.json()) as Order };
    if (res.status === 429) return { ok: false, error: "full" };
    if (res.status === 404) return { ok: false, error: "not_found" };
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export async function advanceOrder(room: string, orderId: string): Promise<void> {
  await fetch(`/api/rooms/${encodeURIComponent(room)}/orders/${encodeURIComponent(orderId)}`, { method: "PATCH" });
}
