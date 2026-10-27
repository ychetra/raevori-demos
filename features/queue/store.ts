import { randomBytes } from "node:crypto";
import { PREFIX, type CallResult, type Counter, type Queue, type QueueEvent, type Service, type Ticket } from "./types";

export class QueueError extends Error {
  constructor(readonly code: "not_found" | "full") {
    super(code);
  }
}

export interface QueueStore {
  create(): Queue;
  get(id: string): Queue | undefined;
  take(id: string, service: Service): Ticket;
  /** Finishes the counter's current ticket and calls the oldest waiting one, if any. */
  call(id: string, counter: Counter): CallResult;
  /** Calls the counter's current ticket again (fresh `at.called`, sent as a ticket event); null when the counter is idle. */
  recall(id: string, counter: Counter): Ticket | null;
  leave(id: string, ticketId: string): Ticket;
  subscribe(id: string, fn: (e: QueueEvent) => void): () => void;
  sweep(): void;
}

/** Fixed demo service time per person ahead. */
export const SERVICE_MINUTES = 3;

/** True when ticket `i` was taken before ticket `j` (take time, then list order for ties). */
const before = (tickets: Ticket[], i: number, j: number) => {
  const a = tickets[i].at.waiting ?? 0;
  const b = tickets[j].at.waiting ?? 0;
  return a < b || (a === b && i < j);
};

/** How many waiting tickets were taken before this one (0 when it is unknown or first in line). */
export function position(tickets: Ticket[], ticketId: string): number {
  const me = tickets.findIndex((t) => t.id === ticketId);
  if (me < 0) return 0;
  return tickets.reduce((n, t, i) => n + (i !== me && t.status === "waiting" && before(tickets, i, me) ? 1 : 0), 0);
}

/** Estimated wait for someone with `ahead` people in front of them. */
export const waitMinutes = (ahead: number) => ahead * SERVICE_MINUTES;

type Entry = Queue & { taken: number; next: Record<Service, number>; listeners: Set<(e: QueueEvent) => void> };

/** Queues live in memory: one per visitor session, private, dropped after `ttlMs` without activity. */
// `now` reads Date.now on each call (not a captured reference), so tests with a fake clock can expire the shared store.
export function createMemoryStore({ maxRooms = 500, maxTickets = 60, ttlMs = 2 * 60 * 60 * 1000, now = () => Date.now() } = {}): QueueStore {
  const rooms = new Map<string, Entry>();

  const touch = (r: Entry) => {
    r.touchedAt = now();
    // Map keeps insertion order; re-inserting puts the most recently touched room last.
    rooms.delete(r.id);
    rooms.set(r.id, r);
  };
  const must = (id: string) => {
    const r = rooms.get(id);
    if (!r) throw new QueueError("not_found");
    return r;
  };
  // Each listener is isolated: one that throws (e.g. a dead live stream) is dropped, and the others
  // still get the event, so a ticket that was stored is never reported as failed.
  const emit = (r: Entry, e: QueueEvent) => {
    for (const fn of [...r.listeners]) {
      try {
        fn(e);
      } catch {
        r.listeners.delete(fn);
      }
    }
  };
  /** Replaces the stored ticket and tells subscribers. */
  const put = (r: Entry, ticket: Ticket) => {
    r.tickets[r.tickets.findIndex((t) => t.id === ticket.id)] = ticket;
    emit(r, { type: "ticket", ticket });
    return ticket;
  };
  const ticket = (r: Entry, service: Service, at: Ticket["at"]): Ticket => ({
    id: randomBytes(9).toString("base64url"),
    room: r.id,
    number: `${PREFIX[service]}-${String(++r.next[service]).padStart(3, "0")}`,
    service,
    status: "waiting",
    at,
  });
  const current = (r: Entry, counter: Counter) => r.tickets.find((t) => t.status === "called" && t.counter === counter);

  // A mid-morning shop: two customers at the counters and four waiting, so the board is never empty
  // and a visitor's first repair ticket is R-015.
  const seed = (r: Entry, service: Service, minutesAgo: number, call?: { counter: Counter; minutesAgo: number }): Ticket => {
    const t = ticket(r, service, { waiting: now() - minutesAgo * 60_000 });
    return call ? { ...t, status: "called", counter: call.counter, at: { ...t.at, called: now() - call.minutesAgo * 60_000 } } : t;
  };

  return {
    create() {
      while (rooms.size >= maxRooms) rooms.delete(rooms.keys().next().value!);
      const r: Entry = { id: randomBytes(12).toString("base64url"), tickets: [], touchedAt: now(), taken: 0, next: { repair: 10, pickup: 6, payment: 3 }, listeners: new Set() };
      r.tickets.push(
        seed(r, "repair", 16, { counter: 2, minutesAgo: 6 }),
        seed(r, "repair", 13, { counter: 1, minutesAgo: 3 }),
        seed(r, "pickup", 10),
        seed(r, "repair", 8),
        seed(r, "payment", 5),
        seed(r, "repair", 2),
      );
      rooms.set(r.id, r);
      return r;
    },
    get: (id) => rooms.get(id),
    take(id, service) {
      const r = must(id);
      if (r.taken >= maxTickets) throw new QueueError("full");
      const t = ticket(r, service, { waiting: now() });
      r.tickets.push(t);
      r.taken++;
      touch(r);
      emit(r, { type: "ticket", ticket: t });
      return t;
    },
    call(id, counter) {
      const r = must(id);
      touch(r);
      const cur = current(r, counter);
      const done = cur ? put(r, { ...cur, status: "done", at: { ...cur.at, done: now() } }) : null;
      let oldest = -1;
      r.tickets.forEach((t, i) => {
        if (t.status === "waiting" && (oldest < 0 || before(r.tickets, i, oldest))) oldest = i;
      });
      const next = r.tickets[oldest];
      const called = next ? put(r, { ...next, status: "called", counter, at: { ...next.at, called: now() } }) : null;
      return { done, called };
    },
    recall(id, counter) {
      const r = must(id);
      touch(r);
      const cur = current(r, counter);
      return cur ? put(r, { ...cur, at: { ...cur.at, called: now() } }) : null;
    },
    leave(id, ticketId) {
      const r = must(id);
      const cur = r.tickets.find((t) => t.id === ticketId);
      if (!cur) throw new QueueError("not_found");
      touch(r);
      if (cur.status === "done" || cur.status === "left") return cur;
      return put(r, { ...cur, status: "left", at: { ...cur.at, left: now() } });
    },
    subscribe(id, fn) {
      const r = must(id);
      r.listeners.add(fn);
      touch(r);
      return () => r.listeners.delete(fn);
    },
    sweep() {
      const cutoff = now() - ttlMs;
      for (const r of rooms.values()) if (r.touchedAt < cutoff) rooms.delete(r.id);
    },
  };
}
