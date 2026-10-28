import type { Lang, Text } from "@/lib/i18n";
import type { CounterConfig, QueueConfig, QueueSettings, QueueStats, ServiceConfig, Ticket } from "./types";

/**
 * Client helpers for the owner's queue admin API (`/api/queues/:id/admin/...`). The admin cookie is HttpOnly and scoped to the
 * queue's admin path; the browser sends it, these helpers never see it.
 *
 * A failed call gives `status` (0 when the network failed) and `error`: "login" (401: not logged in, or the 2 h cookie ran out),
 * "not_found" (404: the queue expired, or an unknown service), "invalid" with `field` (400), "bad_json" (400),
 * "prefix_taken" (409: another service has that letter), "too_many_services" (409: 6), or "failed".
 */
export type AdminFail = { ok: false; status: number; error: string; field?: string };
export type AdminResult<T> = { ok: true; value: T } | AdminFail;

/** An edit: `id` plus only the fields to change. `prefix` is one letter A-Z (lower case is taken as its capital); `minutes` 1-30. */
export type ServicePatch = { id: string; name?: Text; prefix?: string; minutes?: number; hidden?: boolean };
/** A new service; the server picks the id, and minutes default to 3. */
export type NewService = Omit<ServicePatch, "id" | "name" | "prefix"> & { name: Text; prefix: string };
/** One counter in the list sent to saveCounters; its number is its position. Left out, the name is "Counter N". */
export type CounterInput = { name?: Text; open: boolean };

export type QueueSnapshot = { tickets: Ticket[] } & QueueConfig;

const base = (room: string) => `/api/queues/${encodeURIComponent(room)}/admin`;

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

/** Logs this browser in to the queue's admin for 2 hours. too_many_tries: 5 wrong PINs in 10 minutes, wait a few minutes. */
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

/** Whether this browser is already logged in to the queue's admin: "in", "out", or "not_found" when the queue is gone. */
export async function adminSession(room: string): Promise<"in" | "out" | "not_found"> {
  const res = await fetch(`${base(room)}/login`, { cache: "no-store" });
  return res.status === 204 ? "in" : res.status === 404 ? "not_found" : "out";
}

/** Logs this browser out of the queue's admin (clears the cookie). */
export async function adminLogout(room: string): Promise<void> {
  await fetch(`${base(room)}/login`, { method: "DELETE" }).catch(() => {});
}

export const updateService =(room: string, service: ServicePatch) => call<ServiceConfig>(`${base(room)}/services`, "PUT", { service });
export const addService = (room: string, service: NewService) => call<ServiceConfig>(`${base(room)}/services`, "POST", { service });
/** Sets all counters at once (1-4): the count, names and open/closed. A counter closed or dropped while serving finishes that ticket. */
export const saveCounters = (room: string, counters: CounterInput[]) => call<CounterConfig[]>(`${base(room)}/counters`, "PUT", { counters });
export const saveSettings = (room: string, settings: QueueSettings) => call<QueueSettings>(`${base(room)}/settings`, "PUT", settings);
/** Today's served and left counts, average and longest wait (Phnom Penh day). */
export const fetchStats = (room: string) => call<QueueStats>(`${base(room)}/stats`, "GET");
/** Restores the default services, counters and settings; tickets and the PIN stay. */
export const resetQueue = (room: string) => call<QueueSnapshot>(`${base(room)}/reset`, "POST");
/** A link for "Download tickets (Excel)"; the cookie goes with it. `lang` picks the service names' language. */
export const exportUrl = (room: string, lang: Lang) => `${base(room)}/export.csv?lang=${lang}`;
