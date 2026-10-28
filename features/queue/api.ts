import type { CallResult, Counter, ServiceId, Ticket } from "./types";

/** hidden: the owner hid that service after the phone loaded it. */
export type TakeResult = { ok: true; ticket: Ticket } | { ok: false; error: "full" | "not_found" | "hidden" | "failed" };

const base = (room: string) => `/api/queues/${encodeURIComponent(room)}`;
const postJson = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });

/** Thrown by createQueue; `status` is 429 when this network has made too many demo queues. */
export class CreateQueueError extends Error {
  constructor(readonly status: number) {
    super(`create queue ${status}`);
  }
}

/** A new queue; `pin` is its owner-admin PIN, told only to the page that created the queue. */
export async function createQueue(): Promise<{ id: string; pin: string }> {
  const res = await fetch("/api/queues", { method: "POST" });
  if (!res.ok) throw new CreateQueueError(res.status);
  return (await res.json()) as { id: string; pin: string };
}

export async function queueExists(id: string): Promise<boolean> {
  const res = await fetch(base(id), { cache: "no-store" });
  return res.ok;
}

export async function takeTicket(room: string, service: ServiceId): Promise<TakeResult> {
  try {
    const res = await postJson(`${base(room)}/tickets`, { service });
    if (res.status === 201) return { ok: true, ticket: (await res.json()) as Ticket };
    if (res.status === 429) return { ok: false, error: "full" };
    if (res.status === 404) return { ok: false, error: "not_found" };
    if (res.status === 409) return { ok: false, error: "hidden" };
    return { ok: false, error: "failed" };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/**
 * Calls the next customer to `counter`; null when the request failed (the live stream still has the truth).
 * `auto` marks the board's auto-call, which also keeps a few made-up walk-ins waiting.
 */
export async function callNext(room: string, counter: Counter, { auto = false }: { auto?: boolean } = {}): Promise<CallResult | null> {
  try {
    const res = await postJson(`${base(room)}/call`, auto ? { counter, auto: true } : { counter });
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
