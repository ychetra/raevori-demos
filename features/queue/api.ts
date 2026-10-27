import type { CallResult, Counter, Service, Ticket } from "./types";

export type TakeResult = { ok: true; ticket: Ticket } | { ok: false; error: "full" | "not_found" | "failed" };

const base = (room: string) => `/api/queues/${encodeURIComponent(room)}`;
const postJson = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });

export async function createQueue(): Promise<string> {
  const res = await fetch("/api/queues", { method: "POST" });
  if (!res.ok) throw new Error(`create queue ${res.status}`);
  return ((await res.json()) as { id: string }).id;
}

export async function queueExists(id: string): Promise<boolean> {
  const res = await fetch(base(id), { cache: "no-store" });
  return res.ok;
}

export async function takeTicket(room: string, service: Service): Promise<TakeResult> {
  try {
    const res = await postJson(`${base(room)}/tickets`, { service });
    if (res.status === 201) return { ok: true, ticket: (await res.json()) as Ticket };
    if (res.status === 429) return { ok: false, error: "full" };
    if (res.status === 404) return { ok: false, error: "not_found" };
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** Calls the next customer to `counter`; null when the request failed (the live stream still has the truth). */
export async function callNext(room: string, counter: Counter): Promise<CallResult | null> {
  try {
    const res = await postJson(`${base(room)}/call`, { counter });
    return res.ok ? ((await res.json()) as CallResult) : null;
  } catch {
    return null;
  }
}

/** Calls the counter's current ticket again; null when the counter is idle or the request failed. */
export async function recallTicket(room: string, counter: Counter): Promise<Ticket | null> {
  try {
    const res = await postJson(`${base(room)}/recall`, { counter });
    return res.ok ? ((await res.json()) as { ticket: Ticket | null }).ticket : null;
  } catch {
    return null;
  }
}

/** Leaves the queue; null when the request failed. */
export async function leaveQueue(room: string, ticketId: string): Promise<Ticket | null> {
  try {
    const res = await postJson(`${base(room)}/tickets/${encodeURIComponent(ticketId)}/leave`);
    return res.ok ? ((await res.json()) as Ticket) : null;
  } catch {
    return null;
  }
}
