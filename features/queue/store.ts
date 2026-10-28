import { randomBytes, randomInt } from "node:crypto";
import { AdminError, defaultConfig, DEFAULT_MINUTES, editService, MAX_SERVICES, newService, parseCounters, parseSettings } from "./admin";
import type { CallResult, Counter, CounterConfig, Queue, QueueEvent, QueueSettings, ServiceConfig, ServiceId, Ticket } from "./types";

type Code = "not_found" | "full" | "bad_service" | "hidden" | "counter_closed" | "prefix_taken" | "too_many_services";

export class QueueError extends Error {
  constructor(readonly code: Code) {
    super(code);
  }
}

export type LoginResult = "ok" | "wrong" | "locked";

export interface QueueStore {
  create(): Queue;
  get(id: string): Queue | undefined;
  /** Refuses a service the queue doesn't have (bad_service) or has hidden (hidden). */
  take(id: string, service: ServiceId): Ticket;
  /**
   * Finishes the counter's current ticket and calls the oldest waiting one, if any. With `topUp` (the board's
   * auto-call), made-up walk-ins for visible services then join the back of the line until WALK_IN_TARGET are waiting.
   * A closed counter, or one the queue doesn't have, is refused with counter_closed.
   */
  call(id: string, counter: Counter, opts?: { topUp?: boolean }): CallResult;
  /** Calls the counter's current ticket again (fresh `at.called`, sent as a ticket event); null when the counter is idle. */
  recall(id: string, counter: Counter): Ticket | null;
  leave(id: string, ticketId: string): Ticket;
  updateService(id: string, patch: unknown): ServiceConfig;
  addService(id: string, input: unknown): ServiceConfig;
  /** Replaces the counters. A counter that closes or goes while serving someone finishes that ticket as done. */
  setCounters(id: string, input: unknown): CounterConfig[];
  setSettings(id: string, input: unknown): QueueSettings;
  /** Restores the default config; tickets and the PIN stay. */
  reset(id: string): Queue;
  login(id: string, pin: unknown): LoginResult;
  subscribe(id: string, fn: (e: QueueEvent) => void): () => void;
  sweep(): void;
}

/** Fixed demo service time per person ahead (every default service's time). */
export const SERVICE_MINUTES = DEFAULT_MINUTES;
/** An auto-call keeps this many people waiting, so a visitor who scans minutes later still sees a line. */
export const WALK_IN_TARGET = 3;

const PIN_TRIES = 5;
const PIN_WINDOW_MS = 10 * 60 * 1000;

/** True when ticket `i` was taken before ticket `j` (take time, then list order for ties). */
const before = (tickets: Ticket[], i: number, j: number) => {
  const a = tickets[i].at.waiting ?? 0;
  const b = tickets[j].at.waiting ?? 0;
  return a < b || (a === b && i < j);
};

/** The waiting tickets taken before this one (none when it is unknown or first in line). */
function ahead(tickets: Ticket[], ticketId: string): Ticket[] {
  const me = tickets.findIndex((t) => t.id === ticketId);
  if (me < 0) return [];
  return tickets.filter((t, i) => i !== me && t.status === "waiting" && before(tickets, i, me));
}

/** How many waiting tickets were taken before this one (0 when it is unknown or first in line). */
export const position = (tickets: Ticket[], ticketId: string): number => ahead(tickets, ticketId).length;

/** Estimated wait at the fixed 3 minutes per person ahead. The queue's own service times are in estimateWait. */
export const waitMinutes = (ahead: number) => ahead * SERVICE_MINUTES;

/**
 * Estimated minutes until `ticketId` is called: the sum of the service minutes of each waiting ticket ahead of it
 * (3 for a service the queue no longer has). Without `ticketId`, the whole line: what a new number would wait.
 */
export function estimateWait(tickets: Ticket[], services: ServiceConfig[], ticketId?: string): number {
  const line = ticketId === undefined ? tickets.filter((t) => t.status === "waiting") : ahead(tickets, ticketId);
  return line.reduce((sum, t) => sum + (services.find((s) => s.id === t.service)?.minutes ?? DEFAULT_MINUTES), 0);
}

// `next` counts per prefix letter, so a number never repeats in a queue, even after the owner moves a letter to another service.
type Entry = Queue & { taken: number; serviceSeq: number; next: Record<string, number>; pinFails: number[]; listeners: Set<(e: QueueEvent) => void> };

/** Queues live in memory: one per visitor session, private, dropped after `ttlMs` without activity. */
// `now` reads Date.now on each call (not a captured reference), so tests with a fake clock can expire the shared store.
// `maxTickets` caps visitor tickets; walk-ins don't count, but stop once a room holds `maxTotal` tickets (bounds memory).
export function createMemoryStore({ maxRooms = 500, maxTickets = 60, maxTotal = 400, ttlMs = 2 * 60 * 60 * 1000, now = () => Date.now(), random = Math.random } = {}): QueueStore {
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
  // Config arrays are replaced, never changed in place, so a config already sent in an event stays as it was.
  const emitConfig = (r: Entry) => {
    touch(r);
    emit(r, { type: "config", services: r.services, counters: r.counters, settings: r.settings });
  };
  /** Replaces the stored ticket and tells subscribers. */
  const put = (r: Entry, ticket: Ticket) => {
    r.tickets[r.tickets.findIndex((t) => t.id === ticket.id)] = ticket;
    emit(r, { type: "ticket", ticket });
    return ticket;
  };
  const ticket = (r: Entry, service: ServiceConfig, at: Ticket["at"]): Ticket => {
    const n = (r.next[service.prefix] = (r.next[service.prefix] ?? 0) + 1);
    return { id: randomBytes(9).toString("base64url"), room: r.id, number: `${service.prefix}-${String(n).padStart(3, "0")}`, service: service.id, status: "waiting", at };
  };
  const current = (r: Entry, counter: Counter) => r.tickets.find((t) => t.status === "called" && t.counter === counter);
  /** Sets the counters, first finishing the ticket at each counter that is now closed or gone. */
  const applyCounters = (r: Entry, counters: CounterConfig[]) => {
    for (const n of [1, 2, 3, 4] as Counter[]) {
      if (counters.find((c) => c.id === n)?.open) continue;
      const cur = current(r, n);
      if (cur) put(r, { ...cur, status: "done", at: { ...cur.at, done: now() } });
    }
    r.counters = counters;
  };
  const prefixFree = (r: Entry, prefix: string, serviceId?: ServiceId) => {
    if (r.services.some((s) => s.prefix === prefix && s.id !== serviceId)) throw new QueueError("prefix_taken");
  };

  // A mid-morning shop: two customers at the counters and four waiting, so the board is never empty
  // and a visitor's first repair ticket is R-015.
  const seed = (r: Entry, serviceId: ServiceId, minutesAgo: number, call?: { counter: Counter; minutesAgo: number }): Ticket => {
    const t = ticket(r, r.services.find((s) => s.id === serviceId)!, { waiting: now() - minutesAgo * 60_000 });
    return call ? { ...t, status: "called", counter: call.counter, at: { ...t.at, called: now() - call.minutesAgo * 60_000 } } : t;
  };

  return {
    create() {
      while (rooms.size >= maxRooms) rooms.delete(rooms.keys().next().value!);
      const r: Entry = {
        id: randomBytes(12).toString("base64url"),
        tickets: [],
        ...defaultConfig(),
        pin: String(randomInt(0, 10_000)).padStart(4, "0"),
        touchedAt: now(),
        taken: 0,
        serviceSeq: 0,
        next: { R: 10, P: 6, C: 3 },
        pinFails: [],
        listeners: new Set(),
      };
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
    take(id, serviceId) {
      const r = must(id);
      const service = r.services.find((s) => s.id === serviceId);
      if (!service) throw new QueueError("bad_service");
      if (service.hidden) throw new QueueError("hidden");
      if (r.taken >= maxTickets) throw new QueueError("full");
      const t = ticket(r, service, { waiting: now() });
      r.tickets.push(t);
      r.taken++;
      touch(r);
      emit(r, { type: "ticket", ticket: t });
      return t;
    },
    call(id, counter, { topUp = false } = {}) {
      const r = must(id);
      if (!r.counters.find((c) => c.id === counter)?.open) throw new QueueError("counter_closed");
      touch(r);
      const cur = current(r, counter);
      const done = cur ? put(r, { ...cur, status: "done", at: { ...cur.at, done: now() } }) : null;
      let oldest = -1;
      r.tickets.forEach((t, i) => {
        if (t.status === "waiting" && (oldest < 0 || before(r.tickets, i, oldest))) oldest = i;
      });
      const next = r.tickets[oldest];
      const called = next ? put(r, { ...next, status: "called", counter, at: { ...next.at, called: now() } }) : null;
      const visible = r.services.filter((s) => !s.hidden);
      if (topUp && visible.length) {
        // Walk-ins are taken now, so they stand behind everyone already waiting (visitors included).
        let waiting = r.tickets.filter((t) => t.status === "waiting").length;
        while (waiting < WALK_IN_TARGET && r.tickets.length < maxTotal) {
          const t = ticket(r, visible[Math.floor(random() * visible.length)], { waiting: now() });
          r.tickets.push(t);
          emit(r, { type: "ticket", ticket: t });
          waiting++;
        }
      }
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
    updateService(id, patch) {
      const r = must(id);
      const serviceId = patch && typeof patch === "object" ? (patch as { id?: unknown }).id : undefined;
      if (typeof serviceId !== "string") throw new AdminError("id");
      const cur = r.services.find((s) => s.id === serviceId);
      if (!cur) throw new QueueError("not_found");
      const service = editService(cur, patch);
      prefixFree(r, service.prefix, service.id);
      r.services = r.services.map((s) => (s === cur ? service : s));
      emitConfig(r);
      return service;
    },
    addService(id, input) {
      const r = must(id);
      if (r.services.length >= MAX_SERVICES) throw new QueueError("too_many_services");
      let serviceId: string;
      do serviceId = `service-${++r.serviceSeq}`;
      while (r.services.some((s) => s.id === serviceId));
      const service = newService(input, serviceId);
      prefixFree(r, service.prefix);
      r.services = [...r.services, service];
      emitConfig(r);
      return service;
    },
    setCounters(id, input) {
      const r = must(id);
      const counters = parseCounters(input);
      applyCounters(r, counters);
      emitConfig(r);
      return counters;
    },
    setSettings(id, input) {
      const r = must(id);
      r.settings = parseSettings(input);
      emitConfig(r);
      return r.settings;
    },
    reset(id) {
      const r = must(id);
      const config = defaultConfig();
      applyCounters(r, config.counters);
      r.services = config.services;
      r.settings = config.settings;
      emitConfig(r);
      return r;
    },
    login(id, pin) {
      const r = must(id);
      const cutoff = now() - PIN_WINDOW_MS;
      r.pinFails = r.pinFails.filter((t) => t > cutoff);
      touch(r);
      // Once locked, even the right PIN waits, so guessing can't go on behind the 429s.
      if (r.pinFails.length >= PIN_TRIES) return "locked";
      if (typeof pin === "string" && pin === r.pin) return "ok";
      r.pinFails.push(now());
      return "wrong";
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
