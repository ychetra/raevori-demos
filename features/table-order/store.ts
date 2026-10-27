import { randomBytes } from "node:crypto";
import { priceOrder } from "./pricing";
import type { CartLine, Order, Room, RoomEvent } from "./types";

export class RoomError extends Error {
  constructor(readonly code: "not_found" | "full") {
    super(code);
  }
}

export interface RoomStore {
  create(): Room;
  get(id: string): Room | undefined;
  addOrder(id: string, table: number, lines: CartLine[]): Order;
  advance(id: string, orderId: string): Order;
  subscribe(id: string, fn: (e: RoomEvent) => void): () => void;
  sweep(): void;
}

type Entry = Room & { added: number; seq: number; listeners: Set<(e: RoomEvent) => void> };

const NEXT: Record<Order["status"], Order["status"]> = { new: "preparing", preparing: "ready", ready: "ready" };

/** Rooms live in memory: one per visitor session, private, dropped after `ttlMs` without activity. */
export function createMemoryStore({ maxRooms = 500, maxOrders = 30, ttlMs = 2 * 60 * 60 * 1000, now = Date.now } = {}): RoomStore {
  const rooms = new Map<string, Entry>();

  const touch = (r: Entry) => {
    r.touchedAt = now();
    // Map keeps insertion order; re-inserting puts the most recently touched room last.
    rooms.delete(r.id);
    rooms.set(r.id, r);
  };
  const must = (id: string) => {
    const r = rooms.get(id);
    if (!r) throw new RoomError("not_found");
    return r;
  };
  // Each listener is isolated: one that throws (e.g. a dead live stream) is dropped, and the others
  // still get the event, so an order that was stored is never reported as failed.
  const emit = (r: Entry, e: RoomEvent) => {
    for (const fn of [...r.listeners]) {
      try {
        fn(e);
      } catch {
        r.listeners.delete(fn);
      }
    }
  };

  const seed = (r: Entry, table: number, lines: CartLine[], status: Order["status"], minutesAgo: number): Order => {
    const t = now() - minutesAgo * 60_000;
    const { lines: priced, total } = priceOrder(lines);
    return { id: `A${++r.seq}`, room: r.id, table, lines: priced, total, payment: "khqr", status, at: { new: t, preparing: t + 30_000, ...(status === "ready" && { ready: t + 180_000 }) } };
  };

  return {
    create() {
      while (rooms.size >= maxRooms) rooms.delete(rooms.keys().next().value!);
      const r: Entry = { id: randomBytes(12).toString("base64url"), orders: [], touchedAt: now(), added: 0, seq: 9, listeners: new Set() };
      r.orders.push(
        seed(r, 7, [{ itemId: "iced-khmer-coffee", qty: 2, options: {} }], "ready", 6),
        seed(r, 2, [{ itemId: "matcha-latte", qty: 1, options: {} }, { itemId: "mango-smoothie", qty: 1, options: {} }], "preparing", 4),
      );
      rooms.set(r.id, r);
      return r;
    },
    get: (id) => rooms.get(id),
    addOrder(id, table, lines) {
      const r = must(id);
      if (r.added >= maxOrders) throw new RoomError("full");
      const { lines: priced, total } = priceOrder(lines);
      const order: Order = { id: `A${++r.seq}`, room: id, table, lines: priced, total, payment: "khqr", status: "new", at: { new: now() } };
      r.orders.push(order);
      r.added++;
      touch(r);
      emit(r, { type: "order", order });
      return order;
    },
    advance(id, orderId) {
      const r = must(id);
      const i = r.orders.findIndex((o) => o.id === orderId);
      if (i < 0) throw new RoomError("not_found");
      const cur = r.orders[i];
      const status = NEXT[cur.status];
      const order = status === cur.status ? cur : { ...cur, status, at: { ...cur.at, [status]: now() } };
      r.orders[i] = order;
      touch(r);
      if (order !== cur) emit(r, { type: "order", order });
      return order;
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
