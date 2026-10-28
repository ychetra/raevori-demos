import type { Lang, Text } from "@/lib/i18n";
import type { Booking, SalonConfig, SalonSettings, Service, ServiceId, Stylist, StylistHours, StylistId, Weekday } from "./types";

/**
 * Client helpers for the salon owner's admin API (`/api/bookings/:id/admin/...`). The admin cookie is HttpOnly and scoped to the
 * room's admin path; the browser sends it, these helpers never see it.
 *
 * A failed call gives `status` (0 when the network failed) and `error`: "login" (401: not logged in, or the 2 h cookie ran out),
 * "not_found" (404: the room expired, or an unknown service, stylist or booking), "invalid" with `field` (400),
 * "bad_start" / "bad_stylist" (400: a move off the grid, outside the hours or days, in the past, or to an unknown stylist),
 * "taken" (409: the move's new time is not free), "wrong_state" (409: only held or booked slots can be cancelled or moved),
 * "too_many_stylists" (409: 5 already), or "failed".
 */
export type AdminFail = { ok: false; status: number; error: string; field?: string };
export type AdminResult<T> = { ok: true; value: T } | AdminFail;

/** A service edit: `id` plus only the fields to change. `minutes` is 30, 60, 90 or 120; `price` $0.50-500 in 50-cent steps. */
export type ServicePatch = { id: ServiceId; price?: number; minutes?: number; hidden?: boolean };
/** A stylist edit: `id` plus only the fields to change. Names 1-20 characters; hours "HH:MM" on the hour or half hour, or null for the salon's hours. */
export type StylistPatch = { id: StylistId; name?: Text; daysOff?: Weekday[]; hours?: StylistHours | null };
/** A new stylist; the server picks the id. Without `daysOff` and `hours`: every day, following the salon's hours. */
export type NewStylist = Omit<StylistPatch, "id" | "name"> & { name: Text };

export type SalonSnapshot = { bookings: Booking[] } & SalonConfig;

const base = (room: string) => `/api/bookings/${encodeURIComponent(room)}/admin`;

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

/** Logs this browser out of the room's admin (expires the cookie). Never fails loudly. */
export async function adminLogout(room: string): Promise<void> {
  await fetch(`${base(room)}/login`, { method: "DELETE" }).catch(() => {});
}

export const updateService = (room: string, service: ServicePatch) => call<Service>(`${base(room)}/services`, "PUT", { service });
export const updateStylist = (room: string, stylist: StylistPatch) => call<Stylist>(`${base(room)}/stylists`, "PUT", { stylist });
export const addStylist = (room: string, stylist: NewStylist) => call<Stylist>(`${base(room)}/stylists`, "POST", { stylist });
export const saveSettings = (room: string, settings: SalonSettings) => call<SalonSettings>(`${base(room)}/settings`, "PUT", settings);
/** Cancels a held or booked slot. `refund`: true "refund deposit", false "keep deposit" (an unpaid hold is always stored as false). */
export const cancelBooking = (room: string, bookingId: string, reason: string, refund: boolean) =>
  call<Booking>(`${base(room)}/bookings/${encodeURIComponent(bookingId)}`, "PATCH", { action: "cancel", reason, refund });
/** Moves a held or booked slot to `start` (epoch ms), with the same stylist unless `stylist` is given. It keeps its id, service, length and price. */
export const moveBooking = (room: string, bookingId: string, start: number, stylist?: StylistId) =>
  call<Booking>(`${base(room)}/bookings/${encodeURIComponent(bookingId)}`, "PATCH", { action: "move", start, ...(stylist !== undefined && { stylist }) });
/** Restores the default services, stylists and settings; bookings and the PIN stay. */
export const resetSalon = (room: string) => call<SalonSnapshot>(`${base(room)}/reset`, "POST");
/** A link for "Download bookings (Excel)"; the cookie goes with it. `lang` picks the stylist and service names' language. */
export const exportUrl = (room: string, lang: Lang) => `${base(room)}/export.csv?lang=${lang}`;
