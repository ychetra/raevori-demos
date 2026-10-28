import type { Lang, Text } from "@/lib/i18n";
import type { Category, MenuItem, Order, ShopSettings } from "./types";

/**
 * Client helpers for the owner's admin API (`/api/rooms/:id/admin/...`). The admin cookie is HttpOnly and scoped to the
 * room's admin path; the browser sends it, these helpers never see it.
 *
 * A failed call gives `status` (0 when the network failed) and `error`: "login" (401: not logged in, or the 2 h cookie ran out),
 * "not_found" (404: the room expired), "invalid" with `field` (400), "bad_status" (409: order already done or cancelled),
 * "too_many_items" (409: 60 items), or "failed".
 */
export type AdminFail = { ok: false; status: number; error: string; field?: string };
export type AdminResult<T> = { ok: true; value: T } | AdminFail;

/** An edit: `id` plus only the fields to change. `note: null` (or "" in both languages) removes the note. `options` sets choice prices: `{ size: { large: 0.75 } }`. */
export type ItemPatch = {
  id: string;
  name?: Text;
  note?: Text | null;
  price?: number;
  cat?: Category;
  /** `cup:#rrggbb` or `mug:#rrggbb` for drinks, `croissant` or `loaf` for bakery. */
  image?: string;
  options?: Record<string, Record<string, number>>;
  soldOut?: boolean;
  hidden?: boolean;
};
/** A new item; the server picks the id, and the art defaults to the category's. */
export type NewItem = Omit<ItemPatch, "id" | "name" | "price" | "cat"> & { name: Text; price: number; cat: Category };

export type RoomSnapshot = { orders: Order[]; menu: MenuItem[]; settings: ShopSettings };

const base = (room: string) => `/api/rooms/${encodeURIComponent(room)}/admin`;

async function call<T>(url: string, method: string, body?: unknown): Promise<AdminResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      cache: "no-store",
      ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
    if (res.ok) return { ok: true, value: (await res.json()) as T };
    const err = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
    return { ok: false, status: res.status, error: err.error ?? "failed", ...(err.field && { field: err.field }) };
  } catch {
    return { ok: false, status: 0, error: "failed" };
  }
}

/** Logs this browser in to the room's admin for 2 hours. too_many_tries: 5 wrong PINs in 10 minutes, wait a few minutes. */
export async function adminLogin(room: string, pin: string): Promise<{ ok: true } | { ok: false; error: "wrong_pin" | "too_many_tries" | "not_found" | "failed" }> {
  try {
    const res = await fetch(`${base(room)}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    if (res.status === 204) return { ok: true };
    if (res.status === 401) return { ok: false, error: "wrong_pin" };
    if (res.status === 429) return { ok: false, error: "too_many_tries" };
    if (res.status === 404) return { ok: false, error: "not_found" };
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Whether this browser is already logged in to the room's admin: "in", "out", or "not_found" when the room is gone. */
export async function adminSession(room: string): Promise<"in" | "out" | "not_found"> {
  const res = await fetch(`${base(room)}/login`, { cache: "no-store" });
  return res.status === 204 ? "in" : res.status === 404 ? "not_found" : "out";
}

export const updateItem = (room: string, item: ItemPatch) => call<MenuItem>(`${base(room)}/menu`, "PUT", { item });
export const addItem = (room: string, item: NewItem) => call<MenuItem>(`${base(room)}/menu`, "POST", { item });
export const markDone = (room: string, orderId: string) => call<Order>(`${base(room)}/orders/${encodeURIComponent(orderId)}`, "PATCH", { status: "done" });
export const cancelOrder = (room: string, orderId: string, reason: string) =>
  call<Order>(`${base(room)}/orders/${encodeURIComponent(orderId)}`, "PATCH", { status: "cancelled", reason });
export const saveSettings = (room: string, settings: ShopSettings) => call<ShopSettings>(`${base(room)}/settings`, "PUT", settings);
/** Restores the default menu and settings; orders and the PIN stay. */
export const resetShop = (room: string) => call<RoomSnapshot>(`${base(room)}/reset`, "POST");
/** A link for "Download orders (Excel)"; the cookie goes with it. `lang` picks the item names' language. */
export const exportUrl = (room: string, lang: Lang) => `${base(room)}/export.csv?lang=${lang}`;
