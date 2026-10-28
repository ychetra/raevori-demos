import type { Booking, HoldInput, VisitStatus } from "./types";

export type HoldResult = { ok: true; booking: Booking } | { ok: false; error: "taken" | "full" | "not_found" | "invalid" | "failed" };
export type PayResult = { ok: true; booking: Booking } | { ok: false; error: "expired" | "not_found" | "failed" };

const base = (room: string) => `/api/bookings/${encodeURIComponent(room)}`;
const postJson = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });

/** Room creation failed; `status` 429 means this network hit the creation limit. */
export class CreateBookingError extends Error {
  constructor(readonly status: number) {
    super(`create booking room ${status}`);
  }
}

/** A new room; `pin` is its owner-admin PIN, told only to the page that created the room. */
export async function createBookingRoom(): Promise<{ id: string; pin: string }> {
  const res = await fetch("/api/bookings", { method: "POST" });
  if (!res.ok) throw new CreateBookingError(res.status);
  return (await res.json()) as { id: string; pin: string };
}

export async function bookingRoomExists(id: string): Promise<boolean> {
  const res = await fetch(base(id), { cache: "no-store" });
  return res.ok;
}

/** Holds a slot for 5 minutes. `invalid` is a 400 (a bad name, phone or start); `taken` means someone else got there first. */
export async function holdSlot(room: string, input: HoldInput): Promise<HoldResult> {
  try {
    const res = await postJson(`${base(room)}/holds`, input);
    if (res.status === 201) return { ok: true, booking: (await res.json()) as Booking };
    if (res.status === 409) return { ok: false, error: "taken" };
    if (res.status === 429) return { ok: false, error: "full" };
    if (res.status === 404) return { ok: false, error: "not_found" };
    if (res.status === 400) return { ok: false, error: "invalid" };
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Simulated deposit payment for a hold. */
export async function payHold(room: string, holdId: string): Promise<PayResult> {
  try {
    const res = await postJson(`${base(room)}/holds/${encodeURIComponent(holdId)}/pay`);
    if (res.ok) return { ok: true, booking: (await res.json()) as Booking };
    if (res.status === 410) return { ok: false, error: "expired" };
    if (res.status === 404) return { ok: false, error: "not_found" };
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Staff mark a booking arrived or no-show; null when the request failed (the live stream still has the truth). */
export async function setBookingStatus(room: string, bookingId: string, status: VisitStatus): Promise<Booking | null> {
  try {
    const res = await postJson(`${base(room)}/${encodeURIComponent(bookingId)}/status`, { status });
    return res.ok ? ((await res.json()) as Booking) : null;
  } catch {
    return null;
  }
}
